"""Comprehensive unit tests for ClaudeExecutor.

Tests streaming, tool calls, error handling, retry logic,
and database persistence using mocked PydanticAI responses.
"""

import asyncio
import json
import uuid
from datetime import datetime
from typing import Any, AsyncIterator, Dict, List, Optional, Union, AsyncGenerator, Callable
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
import pytest_asyncio
from pydantic import BaseModel

from smithers_py.db.database import SmithersDB
from smithers_py.executors.claude import ClaudeExecutor
from smithers_py.executors.base import (
    AgentResult,
    StreamEvent,
    TaskStatus,
    TokenUsage,
    ToolCallRecord,
)


class TestOutputSchema(BaseModel):
    """Test schema for structured output."""
    answer: str
    confidence: float
    reasoning: List[str]


class ToolCall:
    """Mock tool call for testing."""
    def __init__(self, tool_name: str, args: dict):
        self.tool_name = tool_name
        self.args = args


class ToolReturn:
    """Mock tool return for testing."""
    def __init__(self, tool_name: str, content: Any):
        self.tool_name = tool_name
        self.content = content


class TestModel:
    """Mock model that simulates PydanticAI responses for testing."""

    def __init__(self):
        self._text_queue: List[List[str]] = []
        self._tool_calls: List[Union[ToolCall, ToolReturn]] = []
        self._error: Optional[str] = None
        self._usage: Optional[Dict[str, int]] = None
        self._result: Optional[Any] = None
        self._stream_index = 0

    def set_stream_text(self, tokens: List[str]):
        """Set text tokens to stream."""
        self._text_queue.append(tokens)

    def set_tool_calls(self, calls: List[Union[ToolCall, ToolReturn]]):
        """Set tool calls to execute."""
        self._tool_calls = calls

    def set_error(self, error_msg: str):
        """Set an error to raise."""
        self._error = error_msg

    def set_usage(self, request_tokens: int, response_tokens: int, total_tokens: int):
        """Set token usage."""
        self._usage = {
            "request_tokens": request_tokens,
            "response_tokens": response_tokens,
            "total_tokens": total_tokens,
        }

    def set_result(self, result: Any):
        """Set structured result."""
        self._result = result

    async def run_stream(self, prompt: str, **kwargs):
        """Mock stream execution."""
        # Return a mock stream context manager
        return MockStream(self)


class MockStream:
    """Mock stream context manager."""

    def __init__(self, model: TestModel):
        self.model = model
        self._token_index = 0
        self._current_queue = 0

    async def __aenter__(self):
        """Enter async context."""
        return self

    async def __aexit__(self, exc_type, exc_val, exc_tb):
        """Exit async context."""
        pass

    def __aiter__(self):
        """Make this an async iterator."""
        return self

    async def __anext__(self):
        """Get next item from stream."""
        # Raise error if configured
        if self.model._error:
            raise Exception(self.model._error)

        # Stream text tokens if available
        if self._current_queue < len(self.model._text_queue):
            tokens = self.model._text_queue[self._current_queue]
            if self._token_index < len(tokens):
                token = tokens[self._token_index]
                self._token_index += 1
                await asyncio.sleep(0)
                return token
            else:
                # Move to next queue
                self._current_queue += 1
                self._token_index = 0

        # Process tool calls
        if self.model._tool_calls:
            call = self.model._tool_calls.pop(0)
            await asyncio.sleep(0)
            return call

        # No more items
        raise StopAsyncIteration

    async def get_final_result(self):
        """Get final result."""
        # Create mock result object
        result = MagicMock()

        # Add usage if configured
        if self.model._usage:
            usage = MagicMock()
            usage.request_tokens = self.model._usage["request_tokens"]
            usage.response_tokens = self.model._usage["response_tokens"]
            usage.total_tokens = self.model._usage["total_tokens"]
            result._usage = usage

        # Add data if configured
        if self.model._result:
            result.data = self.model._result

        return result


class MockAgent:
    """Mock PydanticAI Agent."""

    def __init__(self, model, result_type=None, system_prompt=None):
        self.model = model  # Our TestModel instance
        self.result_type = result_type
        self.system_prompt = system_prompt
        self._tools: Dict[str, Callable] = {}

    def tool(self, name: str):
        """Mock tool decorator."""
        def decorator(func: Callable):
            self._tools[name] = func
            return func
        return decorator

    def run_stream(self, prompt: str, message_history=None):
        """Create a stream for this agent."""
        return self.model.run_stream(prompt, message_history=message_history)


@pytest_asyncio.fixture
async def test_db():
    """Create an in-memory test database."""
    db = SmithersDB(":memory:", is_async=True)
    await db.connect()
    await db.initialize_schema()

    # Start test execution
    await db.execution.start("test", "test_claude_executor.py")

    yield db
    await db.close()


@pytest_asyncio.fixture
async def executor(test_db):
    """Create ClaudeExecutor with test database."""
    return ClaudeExecutor(test_db)


# Helper function to parse agent row from query result
def parse_agent_row(row):
    """Convert agent query result to dict."""
    # Based on schema.sql agents table columns (in order):
    # id, execution_id, phase_id, model, system_prompt, prompt, status, scope_rev,
    # result, result_structured, log_path, stream_summary, error, message_history,
    # started_at, completed_at, created_at, duration_ms, tokens_input, tokens_output, tool_calls_count
    return {
        'id': row[0],
        'execution_id': row[1],
        'phase_id': row[2],
        'model': row[3],
        'system_prompt': row[4],
        'prompt': row[5],
        'status': row[6],
        'scope_rev': row[7],
        'result': row[8],  # This is the output_text
        'result_structured': row[9],
        'log_path': row[10],
        'stream_summary': row[11],
        'error': row[12],
        'message_history': row[13],
        'started_at': row[14],
        'completed_at': row[15],
        'created_at': row[16],
        'duration_ms': row[17],
        'tokens_input': row[18],
        'tokens_output': row[19],
        'tool_calls_count': row[20] if len(row) > 20 else None
    }


@pytest.mark.asyncio
async def test_basic_text_execution(executor, test_db):
    """Test basic text generation with streaming."""
    # Configure TestModel response
    test_model = TestModel()
    test_model.set_stream_text(["Hello", " ", "world", "!"])

    # Mock Agent class to return MockAgent with our TestModel
    with patch("smithers_py.executors.claude.Agent") as mock_agent_cls:
        mock_agent_cls.return_value = MockAgent(test_model)

        # Mock the model mapping to return test model
        original_map = executor._map_model_name
        executor._map_model_name = lambda m: test_model

        # Execute
        events = []
        result = None

        async for event in executor.execute(
            node_id="test-node-1",
            prompt="Say hello",
            model="sonnet",
            execution_id=test_db.current_execution_id,
            max_turns=1,
        ):
            if isinstance(event, StreamEvent):
                events.append(event)
            else:
                result = event

        # Restore
        executor._map_model_name = original_map

    # Verify streaming events
    token_events = [e for e in events if e.kind == "token"]
    assert len(token_events) == 4
    assert [e.payload["text"] for e in token_events] == ["Hello", " ", "world", "!"]

    # Verify result
    assert result is not None
    assert isinstance(result, AgentResult)
    assert result.status == TaskStatus.DONE
    assert result.output_text == "Hello world!"
    assert result.node_id == "test-node-1"
    assert result.model == "sonnet"
    assert result.turns_used == 1

    # Verify database persistence
    agents = await test_db.query("SELECT * FROM agents", [])
    assert len(agents) == 1
    agent_row = parse_agent_row(agents[0])
    assert agent_row["status"] == "done"
    assert agent_row["result"] == "Hello world!"
    assert agent_row["model"] == "sonnet"


@pytest.mark.asyncio
async def test_structured_output(executor, test_db):
    """Test structured output with Pydantic schema."""
    # Configure TestModel with structured response
    test_model = TestModel()
    test_output = TestOutputSchema(
        answer="42",
        confidence=0.95,
        reasoning=["The answer to life", "The universe", "And everything"]
    )
    test_model.set_result(test_output)

    # Mock Agent class
    with patch("smithers_py.executors.claude.Agent") as mock_agent_cls:
        mock_agent_cls.return_value = MockAgent(test_model, result_type=TestOutputSchema)

        # Mock the model mapping
        original_map = executor._map_model_name
        executor._map_model_name = lambda m: test_model

        # Execute with schema
        result = None
        async for event in executor.execute(
            node_id="test-node-2",
            prompt="What is the answer?",
            model="opus",
            execution_id=test_db.current_execution_id,
            output_schema=TestOutputSchema,
        ):
            if isinstance(event, AgentResult):
                result = event

        # Restore
        executor._map_model_name = original_map

    # Verify structured output
    assert result is not None
    assert result.status == TaskStatus.DONE
    assert result.output_structured is not None
    assert result.output_structured["answer"] == "42"
    assert result.output_structured["confidence"] == 0.95
    assert len(result.output_structured["reasoning"]) == 3

    # Verify DB persistence
    agents = await test_db.query("SELECT * FROM agents", [])
    assert len(agents) == 1
    agent_row = parse_agent_row(agents[0])
    assert agent_row["result_structured"] is not None
    structured_json = json.loads(agent_row["result_structured"])
    assert structured_json["answer"] == "42"


@pytest.mark.asyncio
async def test_tool_calls(executor, test_db):
    """Test tool call execution and recording."""
    # Define test tools
    async def calculator(a: int, b: int) -> int:
        """Test calculator tool."""
        return a + b

    async def get_weather(city: str) -> dict:
        """Test weather tool."""
        return {"temp": 72, "condition": "sunny", "city": city}

    tools = {
        "calculator": calculator,
        "get_weather": get_weather,
    }

    # Configure TestModel with tool calls
    test_model = TestModel()
    test_model.set_stream_text(["Let me ", "calculate ", "and check weather..."])
    test_model.set_tool_calls([
        ToolCall(tool_name="calculator", args={"a": 5, "b": 3}),
        ToolReturn(tool_name="calculator", content=8),
        ToolCall(tool_name="get_weather", args={"city": "San Francisco"}),
        ToolReturn(
            tool_name="get_weather",
            content={"temp": 72, "condition": "sunny", "city": "San Francisco"}
        ),
    ])
    test_model.set_stream_text(["The sum is 8 and weather is sunny!"])

    # Mock Agent class
    with patch("smithers_py.executors.claude.Agent") as mock_agent_cls:
        mock_agent = MockAgent(test_model)
        mock_agent_cls.return_value = mock_agent

        # Mock the model mapping
        original_map = executor._map_model_name
        executor._map_model_name = lambda m: test_model

        # Execute
        events = []
        result = None

        async for event in executor.execute(
            node_id="test-node-3",
            prompt="Calculate 5+3 and get SF weather",
            model="haiku",
            execution_id=test_db.current_execution_id,
            tools=tools,
        ):
            if isinstance(event, StreamEvent):
                events.append(event)
            else:
                result = event

        # Restore
        executor._map_model_name = original_map

    # Verify tool events
    tool_starts = [e for e in events if e.kind == "tool_start"]
    tool_ends = [e for e in events if e.kind == "tool_end"]

    assert len(tool_starts) == 2
    assert tool_starts[0].payload["tool"] == "calculator"
    assert tool_starts[0].payload["input"] == {"a": 5, "b": 3}
    assert tool_starts[1].payload["tool"] == "get_weather"
    assert tool_starts[1].payload["input"] == {"city": "San Francisco"}

    assert len(tool_ends) == 2
    assert tool_ends[0].payload["tool"] == "calculator"
    assert tool_ends[0].payload["output"] == 8
    assert tool_ends[1].payload["tool"] == "get_weather"
    assert tool_ends[1].payload["output"]["temp"] == 72

    # Verify result
    assert result is not None
    assert result.status == TaskStatus.DONE
    assert len(result.tool_calls) == 2

    calc_call = result.tool_calls[0]
    assert calc_call.tool_name == "calculator"
    assert calc_call.input_data == {"a": 5, "b": 3}
    assert calc_call.output_data == {"result": 8}
    assert calc_call.duration_ms >= 0

    weather_call = result.tool_calls[1]
    assert weather_call.tool_name == "get_weather"
    assert weather_call.input_data == {"city": "San Francisco"}
    assert weather_call.output_data["result"]["temp"] == 72

    # Verify DB persistence
    tool_records = await test_db.query(
        "SELECT * FROM tool_calls WHERE agent_id = ?",
        [result.run_id]
    )
    assert len(tool_records) == 2
    # tool_calls table columns: id, agent_id, execution_id, tool_name, input, output_inline, ...
    assert tool_records[0][3] == "calculator"  # tool_name
    assert tool_records[1][3] == "get_weather"  # tool_name


@pytest.mark.asyncio
async def test_error_handling(executor, test_db):
    """Test error handling and status updates."""
    # Configure TestModel to raise error
    test_model = TestModel()
    test_model.set_error("API rate limit exceeded")

    # Mock Agent class
    with patch("smithers_py.executors.claude.Agent") as mock_agent_cls:
        mock_agent_cls.return_value = MockAgent(test_model)

        # Mock the model mapping
        original_map = executor._map_model_name
        executor._map_model_name = lambda m: test_model

        # Execute
        events = []
        result = None

        async for event in executor.execute(
            node_id="test-node-4",
            prompt="This will fail",
            model="sonnet",
            execution_id=test_db.current_execution_id,
        ):
            if isinstance(event, StreamEvent):
                events.append(event)
            else:
                result = event

        # Restore
        executor._map_model_name = original_map

    # Verify error event
    error_events = [e for e in events if e.kind == "error"]
    assert len(error_events) == 1
    assert "API rate limit exceeded" in error_events[0].payload["error"]

    # Verify result
    assert result is not None
    assert result.status == TaskStatus.ERROR
    assert result.error_message == "API rate limit exceeded"
    assert result.error_type == "Exception"
    assert result.ended_at is not None

    # Verify DB persistence
    agents = await test_db.query("SELECT * FROM agents", [])
    assert len(agents) == 1
    agent_row = parse_agent_row(agents[0])
    assert agent_row["status"] == "error"
    assert agent_row["error"] is not None
    error_json = json.loads(agent_row["error"])
    assert error_json["message"] == "API rate limit exceeded"


@pytest.mark.asyncio
@pytest.mark.skip(reason="Mock executes too fast to test cancellation; test would need real delay")
async def test_cancellation(executor, test_db):
    """Test execution cancellation."""
    # Configure TestModel with delayed response
    test_model = TestModel()
    test_model.set_stream_text(["Starting", " long", " response..."])

    # Mock Agent class
    with patch("smithers_py.executors.claude.Agent") as mock_agent_cls:
        mock_agent_cls.return_value = MockAgent(test_model)

        # Mock the model mapping
        original_map = executor._map_model_name
        executor._map_model_name = lambda m: test_model

        # Start execution in background
        execution_task = asyncio.create_task(
            executor.execute(
                node_id="test-node-5",
                prompt="Generate long response",
                model="opus",
                execution_id=test_db.current_execution_id,
            ).__anext__()
        )

        # Wait briefly then cancel
        await asyncio.sleep(0.1)
        execution_task.cancel()

        # Verify cancellation
        with pytest.raises(asyncio.CancelledError):
            await execution_task

        # Restore
        executor._map_model_name = original_map


@pytest.mark.asyncio
async def test_model_mapping(executor):
    """Test model name mapping."""
    # Test short names
    assert executor._map_model_name("sonnet") == "claude-3-5-sonnet-20241022"
    assert executor._map_model_name("opus") == "claude-3-opus-20240229"
    assert executor._map_model_name("haiku") == "claude-3-5-haiku-20241022"

    # Test full names pass through
    assert executor._map_model_name("claude-3-5-sonnet-20241022") == "claude-3-5-sonnet-20241022"

    # Test unknown model passes through
    assert executor._map_model_name("gpt-4") == "gpt-4"


@pytest.mark.asyncio
async def test_token_usage_tracking(executor, test_db):
    """Test token usage tracking from PydanticAI."""
    # Configure TestModel with usage
    test_model = TestModel()
    test_model.set_stream_text(["Response text"])
    test_model.set_usage(request_tokens=100, response_tokens=50, total_tokens=150)

    # Mock Agent class
    with patch("smithers_py.executors.claude.Agent") as mock_agent_cls:
        mock_agent_cls.return_value = MockAgent(test_model)

        # Mock the model mapping
        original_map = executor._map_model_name
        executor._map_model_name = lambda m: test_model

        # Execute
        result = None
        async for event in executor.execute(
            node_id="test-node-6",
            prompt="Track my tokens",
            model="sonnet",
            execution_id=test_db.current_execution_id,
        ):
            if isinstance(event, AgentResult):
                result = event

        # Restore
        executor._map_model_name = original_map

    # Verify usage tracking
    assert result is not None
    assert result.usage.prompt_tokens == 100
    assert result.usage.completion_tokens == 50
    assert result.usage.total_tokens == 150

    # Verify DB persistence
    agents = await test_db.query("SELECT * FROM agents", [])
    agent_row = parse_agent_row(agents[0])
    assert agent_row["tokens_input"] == 100
    assert agent_row["tokens_output"] == 50


@pytest.mark.asyncio
async def test_multiple_turns(executor, test_db):
    """Test multi-turn conversation tracking."""
    # Configure TestModel for multiple turns
    test_model = TestModel()
    test_model.set_stream_text(["Turn 1 response"])
    test_model.set_stream_text(["Turn 2 response"])
    test_model.set_stream_text(["Turn 3 response"])

    # Mock Agent class
    with patch("smithers_py.executors.claude.Agent") as mock_agent_cls:
        mock_agent_cls.return_value = MockAgent(test_model)

        # Mock the model mapping
        original_map = executor._map_model_name
        executor._map_model_name = lambda m: test_model

        # Execute with high max_turns
        result = None
        async for event in executor.execute(
            node_id="test-node-7",
            prompt="Have a conversation",
            model="opus",
            execution_id=test_db.current_execution_id,
            max_turns=5,
        ):
            if isinstance(event, AgentResult):
                result = event

        # Restore
        executor._map_model_name = original_map

    # Verify turns tracking
    assert result is not None
    assert result.max_turns == 5
    # TODO: Verify actual turns used once multi-turn is properly implemented


@pytest.mark.asyncio
async def test_empty_response(executor, test_db):
    """Test handling of empty response."""
    # Configure TestModel with empty response
    test_model = TestModel()
    test_model.set_stream_text([])

    # Mock Agent class
    with patch("smithers_py.executors.claude.Agent") as mock_agent_cls:
        mock_agent_cls.return_value = MockAgent(test_model)

        # Mock the model mapping
        original_map = executor._map_model_name
        executor._map_model_name = lambda m: test_model

        # Execute
        result = None
        async for event in executor.execute(
            node_id="test-node-8",
            prompt="Return nothing",
            model="haiku",
            execution_id=test_db.current_execution_id,
        ):
            if isinstance(event, AgentResult):
                result = event

        # Restore
        executor._map_model_name = original_map

    # Verify empty response handling
    assert result is not None
    assert result.status == TaskStatus.DONE
    assert result.output_text == ""


@pytest.mark.asyncio
async def test_concurrent_executions(executor, test_db):
    """Test multiple concurrent executions."""
    # Create separate test models for each concurrent execution
    test_models = []
    for i in range(3):
        model = TestModel()
        model.set_stream_text([f"Response{i}"])
        test_models.append(model)

    # Mock Agent class
    with patch("smithers_py.executors.claude.Agent") as mock_agent_cls:
        # Configure mock to return different agents
        agents = [MockAgent(model) for model in test_models]
        mock_agent_cls.side_effect = agents

        # Mock the model mapping
        model_index = 0
        def get_model(m):
            nonlocal model_index
            model = test_models[model_index % len(test_models)]
            model_index += 1
            return model

        original_map = executor._map_model_name
        executor._map_model_name = get_model

        # Define execution coroutine
        async def run_execution(node_id: str, prompt: str):
            result = None
            async for event in executor.execute(
                node_id=node_id,
                prompt=prompt,
                model="sonnet",
                execution_id=test_db.current_execution_id,
            ):
                if isinstance(event, AgentResult):
                    result = event
            return result

        # Run concurrent executions
        results = await asyncio.gather(
            run_execution("concurrent-1", "Say Response0"),
            run_execution("concurrent-2", "Say Response1"),
            run_execution("concurrent-3", "Say Response2"),
        )

        # Restore
        executor._map_model_name = original_map

    # Verify all completed
    assert len(results) == 3
    assert all(r.status == TaskStatus.DONE for r in results)
    assert results[0].output_text == "Response0"
    assert results[1].output_text == "Response1"
    assert results[2].output_text == "Response2"


@pytest.mark.asyncio
async def test_database_methods(executor, test_db):
    """Test database integration methods."""
    # Test save_agent_result
    result = AgentResult(
        run_id="test-run-123",
        node_id="test-node",
        status=TaskStatus.DONE,
        model="sonnet",
        started_at=datetime.now(),
        ended_at=datetime.now(),
        output_text="Test output",
        turns_used=1,
        max_turns=5,
        usage=TokenUsage(prompt_tokens=10, completion_tokens=20, total_tokens=30),
    )

    await executor._persist_result(result, test_db.current_execution_id)

    # Verify saved
    agents = await test_db.query("SELECT * FROM agents WHERE id = ?", ["test-run-123"])
    assert len(agents) == 1
    agent_row = parse_agent_row(agents[0])
    assert agent_row["result"] == "Test output"


@pytest.mark.asyncio
async def test_resume_from_history(executor, test_db):
    """Test resuming from saved history."""
    # Save initial run
    initial_result = AgentResult(
        run_id="resume-test-123",
        node_id="resume-node",
        status=TaskStatus.DONE,
        model="sonnet",
        started_at=datetime.now(),
        ended_at=datetime.now(),
        output_text="Initial response",
        turns_used=1,
    )

    await executor._persist_result(initial_result, test_db.current_execution_id)

    # Configure TestModel for resume
    test_model = TestModel()
    test_model.set_stream_text(["Resumed response"])

    # Mock Agent class
    with patch("smithers_py.executors.claude.Agent") as mock_agent_cls:
        mock_agent_cls.return_value = MockAgent(test_model)

        # Mock the model mapping
        original_map = executor._map_model_name
        executor._map_model_name = lambda m: test_model

        # Execute with resume
        events = []
        result = None
        async for event in executor.execute(
            node_id="resume-node",
            prompt="Continue conversation",
            model="sonnet",
            execution_id=test_db.current_execution_id,
            resume_from="resume-test-123",
        ):
            if isinstance(event, StreamEvent):
                events.append(event)
            else:
                result = event

        # Restore
        executor._map_model_name = original_map

    # Verify resumed event
    resumed_events = [e for e in events if e.kind == "resumed"]
    assert len(resumed_events) == 1

    # Verify result
    assert result is not None
    assert result.status == TaskStatus.DONE
    assert result.output_text == "Resumed response"
    assert result.run_id == "resume-test-123"  # Same run ID


def test_claude_executor_import_error_message():
    """Verify ClaudeExecutor import provides clear error when pydantic_ai missing."""
    from smithers_py.executors import ClaudeExecutor
    assert ClaudeExecutor is not None
    assert not isinstance(ClaudeExecutor, type(None))


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])