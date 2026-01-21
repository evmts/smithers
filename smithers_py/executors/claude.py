"""Claude executor implementation using PydanticAI.

Manages Claude agent execution with:
- Model selection and configuration
- Streaming token output
- Tool call handling
- Session persistence and resumability
- Database persistence of execution state
"""

import asyncio
import json
import uuid
from datetime import datetime
from typing import Any, AsyncIterator, Dict, Optional, List, Type

from pydantic import BaseModel
from pydantic_ai import Agent
from pydantic_ai.models import KnownModelName
from pydantic_ai.result import RunResult, Usage
from pydantic_ai.messages import (
    ModelMessage,
    UserPrompt,
    ModelTextResponse,
    ToolCall,
    ToolReturn,
    ModelStructuredResponse,
)

from ..db.database import SmithersDB
from .base import (
    ExecutorProtocol,
    AgentResult,
    StreamEvent,
    TaskStatus,
    TokenUsage,
    ToolCallRecord,
)


class ClaudeExecutor:
    """Executor for Claude agents using PydanticAI.

    Handles model configuration, streaming, tool calls, and persistence.
    """

    # Model name mappings from Smithers to PydanticAI
    MODEL_MAPPING = {
        # Short names
        "sonnet": "claude-3-5-sonnet-20241022",
        "opus": "claude-3-opus-20240229",
        "haiku": "claude-3-5-haiku-20241022",
        # Full names pass through
        "claude-3-5-sonnet-20241022": "claude-3-5-sonnet-20241022",
        "claude-3-opus-20240229": "claude-3-opus-20240229",
        "claude-3-5-haiku-20241022": "claude-3-5-haiku-20241022",
    }

    def __init__(self, db: SmithersDB):
        self.db = db
        self._running_agents: Dict[str, Agent] = {}

    def _map_model_name(self, model: str) -> KnownModelName:
        """Map Smithers model name to PydanticAI model name."""
        mapped = self.MODEL_MAPPING.get(model, model)
        # PydanticAI expects type-narrowed string literal
        return mapped  # type: ignore

    async def execute(
        self,
        node_id: str,
        prompt: str,
        model: str,
        execution_id: str,
        max_turns: int = 50,
        tools: Optional[Dict[str, Any]] = None,
        schema: Optional[Type[BaseModel]] = None,
        resume_from: Optional[str] = None,
    ) -> AsyncIterator[StreamEvent | AgentResult]:
        """Execute a Claude agent with streaming support.

        Yields StreamEvents during execution and AgentResult at the end.
        """
        run_id = resume_from or str(uuid.uuid4())
        started_at = datetime.now()

        # Create result object to track state
        result = AgentResult(
            run_id=run_id,
            node_id=node_id,
            status=TaskStatus.RUNNING,
            model=model,
            started_at=started_at,
            max_turns=max_turns,
        )

        try:
            # Map model name
            pydantic_model = self._map_model_name(model)

            # Create PydanticAI agent
            if schema:
                agent = Agent(
                    model=pydantic_model,
                    result_type=schema,
                    system_prompt=None,  # We include system in user prompt
                )
            else:
                agent = Agent(
                    model=pydantic_model,
                    result_type=str,  # Default to string output
                    system_prompt=None,
                )

            # Register tools if provided
            if tools:
                for name, func in tools.items():
                    agent.tool(name)(func)

            # Store for cancellation
            self._running_agents[run_id] = agent

            # Load message history if resuming
            message_history: List[ModelMessage] = []
            if resume_from:
                # Load from database
                history_data = await self.db.get_agent_history(run_id)
                if history_data:
                    message_history = self._deserialize_history(history_data)
                    # Yield progress event
                    yield StreamEvent(
                        kind="resumed",
                        payload={"run_id": run_id, "messages": len(message_history)},
                    )

            # Stream the agent execution
            accumulated_text = []
            async for event in self._stream_agent(
                agent, prompt, message_history, result
            ):
                if isinstance(event, StreamEvent):
                    # Track text tokens
                    if event.kind == "token":
                        accumulated_text.append(event.payload.get("text", ""))
                    yield event
                elif isinstance(event, AgentResult):
                    # Final result
                    result = event

            # Set final output
            if accumulated_text and not result.output_text:
                result.output_text = "".join(accumulated_text)

            # Mark complete
            result.status = TaskStatus.DONE
            result.ended_at = datetime.now()

            # Persist to database
            await self._persist_result(result)

        except asyncio.CancelledError:
            result.status = TaskStatus.CANCELLED
            result.ended_at = datetime.now()
            await self._persist_result(result)
            raise

        except Exception as e:
            result.status = TaskStatus.ERROR
            result.ended_at = datetime.now()
            result.error = e
            result.error_message = str(e)
            result.error_type = type(e).__name__
            await self._persist_result(result)

            # Yield error event
            yield StreamEvent(
                kind="error",
                payload={
                    "error": str(e),
                    "type": type(e).__name__,
                },
            )

        finally:
            # Clean up
            self._running_agents.pop(run_id, None)

        # Yield final result
        yield result

    async def _stream_agent(
        self,
        agent: Agent,
        prompt: str,
        message_history: List[ModelMessage],
        result: AgentResult,
    ) -> AsyncIterator[StreamEvent | AgentResult]:
        """Stream agent execution with tool calls and token events."""
        # Run agent with streaming
        try:
            # Create initial user prompt
            messages = message_history + [UserPrompt(prompt)]

            # Run with streaming
            async with agent.run_stream(prompt, message_history=message_history) as stream:
                # Track current tool call
                current_tool: Optional[Dict[str, Any]] = None

                async for message in stream:
                    if isinstance(message, str):
                        # Text token
                        yield StreamEvent(
                            kind="token",
                            payload={"text": message},
                        )

                    elif isinstance(message, ModelTextResponse):
                        # Complete text response
                        yield StreamEvent(
                            kind="model_response",
                            payload={"text": message.content},
                        )

                    elif isinstance(message, ToolCall):
                        # Tool call started
                        current_tool = {
                            "name": message.tool_name,
                            "input": message.args,
                            "started_at": datetime.now(),
                        }
                        yield StreamEvent(
                            kind="tool_start",
                            payload={
                                "tool": message.tool_name,
                                "input": message.args,
                            },
                        )

                    elif isinstance(message, ToolReturn):
                        # Tool call completed
                        if current_tool:
                            tool_record = ToolCallRecord(
                                tool_name=current_tool["name"],
                                input_data=current_tool["input"],
                                output_data={"result": message.content},
                                started_at=current_tool["started_at"],
                                ended_at=datetime.now(),
                                duration_ms=int(
                                    (
                                        datetime.now() - current_tool["started_at"]
                                    ).total_seconds()
                                    * 1000
                                ),
                            )
                            result.tool_calls.append(tool_record)

                            yield StreamEvent(
                                kind="tool_end",
                                payload={
                                    "tool": current_tool["name"],
                                    "output": message.content,
                                    "duration_ms": tool_record.duration_ms,
                                },
                            )
                            current_tool = None

                # Get final result
                final_result = await stream.get_final_result()

                # Update result with usage
                if hasattr(final_result, "_usage"):
                    usage = final_result._usage
                    result.usage = TokenUsage(
                        prompt_tokens=usage.request_tokens or 0,
                        completion_tokens=usage.response_tokens or 0,
                        total_tokens=usage.total_tokens or 0,
                    )

                # Update turns used
                result.turns_used = len(
                    [m for m in messages if isinstance(m, (UserPrompt, ModelTextResponse))]
                )

                # Set structured output if schema was used
                if hasattr(final_result, "data") and final_result.data is not None:
                    if isinstance(final_result.data, BaseModel):
                        result.output_structured = final_result.data.model_dump()
                    else:
                        result.output_text = str(final_result.data)

        except Exception as e:
            # Let outer handler deal with it
            raise

    async def cancel(self, run_id: str) -> bool:
        """Cancel a running execution."""
        if run_id in self._running_agents:
            # PydanticAI doesn't have direct cancellation, but we can
            # remove it from tracking which will prevent further processing
            self._running_agents.pop(run_id, None)
            # Update database
            await self.db.update_agent_status(run_id, TaskStatus.CANCELLED)
            return True
        return False

    async def _persist_result(self, result: AgentResult) -> None:
        """Persist agent result to database."""
        await self.db.save_agent_result(
            execution_id=execution_id,
            node_id=result.node_id,
            run_id=result.run_id,
            model=result.model,
            status=result.status.value,
            started_at=result.started_at,
            ended_at=result.ended_at,
            turns_used=result.turns_used,
            usage_json=json.dumps(
                {
                    "prompt_tokens": result.usage.prompt_tokens,
                    "completion_tokens": result.usage.completion_tokens,
                    "total_tokens": result.usage.total_tokens,
                }
            ),
            output_text=result.output_text,
            output_structured_json=json.dumps(result.output_structured)
            if result.output_structured
            else None,
            error_json=json.dumps(
                {
                    "message": result.error_message,
                    "type": result.error_type,
                }
            )
            if result.error
            else None,
        )

        # Save tool calls
        for tool_call in result.tool_calls:
            await self.db.save_tool_call(
                run_id=result.run_id,
                tool_name=tool_call.tool_name,
                input_json=json.dumps(tool_call.input_data),
                output_json=json.dumps(tool_call.output_data)
                if tool_call.output_data
                else None,
                error=tool_call.error,
                started_at=tool_call.started_at,
                ended_at=tool_call.ended_at,
                duration_ms=tool_call.duration_ms,
            )

    def _deserialize_history(self, history_data: str) -> List[ModelMessage]:
        """Deserialize message history from database."""
        # This would need to handle the specific format stored in DB
        # For now, return empty list
        return []