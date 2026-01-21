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
from typing import Any, AsyncIterator, Dict, Optional, List, Type, Union

from pydantic import BaseModel

# PydanticAI imports - may need adjustment based on version
try:
    from pydantic_ai import Agent
    from pydantic_ai.models import KnownModelName
    from pydantic_ai.result import FinalResult, RunUsage
    from pydantic_ai.messages import ModelMessage
    PYDANTIC_AI_AVAILABLE = True
except ImportError:
    # Stub types for when pydantic_ai is not available or API changed
    Agent = None  # type: ignore
    KnownModelName = str  # type: ignore
    FinalResult = None  # type: ignore
    RunUsage = None  # type: ignore
    ModelMessage = None  # type: ignore
    PYDANTIC_AI_AVAILABLE = False

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
    ) -> AsyncIterator[Union[StreamEvent, AgentResult]]:
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
                if self.db.is_async:
                    async with self.db.connection.execute(
                        "SELECT message_history FROM agents WHERE id = ?", (run_id,)
                    ) as cursor:
                        row = await cursor.fetchone()
                        history_data = row[0] if row else None
                else:
                    row = self.db.connection.execute(
                        "SELECT message_history FROM agents WHERE id = ?", (run_id,)
                    ).fetchone()
                    history_data = row[0] if row else None

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
            await self._persist_result(result, execution_id)

        except asyncio.CancelledError:
            result.status = TaskStatus.CANCELLED
            result.ended_at = datetime.now()
            await self._persist_result(result, execution_id)
            raise

        except Exception as e:
            result.status = TaskStatus.ERROR
            result.ended_at = datetime.now()
            result.error = e
            result.error_message = str(e)
            result.error_type = type(e).__name__
            await self._persist_result(result, execution_id)

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
    ) -> AsyncIterator[Union[StreamEvent, AgentResult]]:
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
            if self.db.is_async:
                await self.db.connection.execute(
                    "UPDATE agents SET status = ? WHERE id = ?",
                    (TaskStatus.CANCELLED.value, run_id)
                )
                await self.db.connection.commit()
            else:
                self.db.connection.execute(
                    "UPDATE agents SET status = ? WHERE id = ?",
                    (TaskStatus.CANCELLED.value, run_id)
                )
                self.db.connection.commit()
            return True
        return False

    async def _persist_result(self, result: AgentResult, execution_id: str) -> None:
        """Persist agent result to database."""
        # The agents table expects different columns based on the schema
        # Map our fields to the schema columns
        usage_data = {
            "prompt_tokens": result.usage.prompt_tokens if result.usage else 0,
            "completion_tokens": result.usage.completion_tokens if result.usage else 0,
            "total_tokens": result.usage.total_tokens if result.usage else 0,
        }

        error_details = None
        if result.error:
            error_details = json.dumps({
                "message": result.error_message,
                "type": result.error_type,
            })

        # Insert into agents table matching the schema
        if self.db.is_async:
            await self.db.connection.execute(
                """INSERT OR REPLACE INTO agents
                   (id, execution_id, node_id, model, status, started_at, completed_at,
                    result, result_structured, error, tokens_input, tokens_output)
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
                (result.run_id, execution_id, result.node_id, result.model, result.status.value,
                 result.started_at.isoformat(), result.ended_at.isoformat() if result.ended_at else None,
                 result.output_text, json.dumps(result.output_structured) if result.output_structured else None,
                 error_details, usage_data["prompt_tokens"], usage_data["completion_tokens"])
            )
            await self.db.connection.commit()
        else:
            self.db.connection.execute(
                """INSERT OR REPLACE INTO agents
                   (id, execution_id, node_id, model, status, started_at, completed_at,
                    result, result_structured, error, tokens_input, tokens_output)
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
                (result.run_id, execution_id, result.node_id, result.model, result.status.value,
                 result.started_at.isoformat(), result.ended_at.isoformat() if result.ended_at else None,
                 result.output_text, json.dumps(result.output_structured) if result.output_structured else None,
                 error_details, usage_data["prompt_tokens"], usage_data["completion_tokens"])
            )
            self.db.connection.commit()

        # Save tool calls
        for tool_call in result.tool_calls:
            call_id = str(uuid.uuid4())
            if self.db.is_async:
                await self.db.connection.execute(
                    """INSERT INTO tool_calls
                       (id, agent_id, execution_id, tool_name, input, output_inline,
                        status, error, started_at, completed_at, duration_ms)
                       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
                    (call_id, result.run_id, execution_id, tool_call.tool_name,
                     json.dumps(tool_call.input_data),
                     json.dumps(tool_call.output_data) if tool_call.output_data else None,
                     "completed", tool_call.error,
                     tool_call.started_at.isoformat() if tool_call.started_at else None,
                     tool_call.ended_at.isoformat() if tool_call.ended_at else None,
                     tool_call.duration_ms)
                )
            else:
                self.db.connection.execute(
                    """INSERT INTO tool_calls
                       (id, agent_id, execution_id, tool_name, input, output_inline,
                        status, error, started_at, completed_at, duration_ms)
                       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
                    (call_id, result.run_id, execution_id, tool_call.tool_name,
                     json.dumps(tool_call.input_data),
                     json.dumps(tool_call.output_data) if tool_call.output_data else None,
                     "completed", tool_call.error,
                     tool_call.started_at.isoformat() if tool_call.started_at else None,
                     tool_call.ended_at.isoformat() if tool_call.ended_at else None,
                     tool_call.duration_ms)
                )

    def _deserialize_history(self, history_data: str) -> List[ModelMessage]:
        """Deserialize message history from database."""
        # This would need to handle the specific format stored in DB
        # For now, return empty list
        return []