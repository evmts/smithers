"""Tests for NDJSON logging module."""

import json
import io
import tempfile
import shutil
from pathlib import Path
import pytest

from .ndjson import (
    NDJSONLogger,
    EventType,
    LogEvent,
    LogSummary,
    SummarizationConfig,
    create_logger,
)


class TestLogEvent:
    """Tests for LogEvent dataclass."""

    def test_to_ndjson_basic(self):
        event = LogEvent(
            timestamp="2024-01-01T00:00:00Z",
            event_type=EventType.INFO,
            execution_id="exec-123",
            payload={"message": "test"},
        )
        line = event.to_ndjson()
        data = json.loads(line)
        assert data["ts"] == "2024-01-01T00:00:00Z"
        assert data["type"] == "info"
        assert data["exec"] == "exec-123"
        assert data["payload"] == {"message": "test"}
        assert "frame" not in data
        assert "node" not in data
        assert "task" not in data

    def test_to_ndjson_with_ids(self):
        event = LogEvent(
            timestamp="2024-01-01T00:00:00Z",
            event_type=EventType.NODE_MOUNT,
            execution_id="exec-123",
            payload={"node_type": "Agent"},
            frame_id=5,
            node_id="node-abc",
            task_id="task-xyz",
        )
        line = event.to_ndjson()
        data = json.loads(line)
        assert data["frame"] == 5
        assert data["node"] == "node-abc"
        assert data["task"] == "task-xyz"


class TestLogSummary:
    """Tests for LogSummary dataclass."""

    def test_to_dict(self):
        summary = LogSummary(
            execution_id="exec-123",
            total_events=100,
            event_counts={"info": 50, "error": 5},
            first_timestamp="2024-01-01T00:00:00Z",
            last_timestamp="2024-01-01T01:00:00Z",
            total_frames=10,
            errors=5,
            warnings=3,
        )
        d = summary.to_dict()
        assert d["execution_id"] == "exec-123"
        assert d["total_events"] == 100
        assert d["event_counts"] == {"info": 50, "error": 5}
        assert d["total_frames"] == 10
        assert d["errors"] == 5
        assert d["warnings"] == 3


class TestNDJSONLogger:
    """Tests for NDJSONLogger."""

    @pytest.fixture
    def temp_dir(self):
        """Create a temporary directory for tests."""
        d = tempfile.mkdtemp()
        yield d
        shutil.rmtree(d)

    def test_creates_log_directory(self, temp_dir):
        logger = NDJSONLogger("exec-001", base_dir=temp_dir)
        log_dir = Path(temp_dir) / "executions" / "exec-001" / "logs"
        assert log_dir.exists()
        logger.close()

    def test_log_basic_event(self, temp_dir):
        logger = NDJSONLogger("exec-001", base_dir=temp_dir)
        logger.log(EventType.INFO, {"message": "hello"})
        logger.close()

        log_path = Path(temp_dir) / "executions" / "exec-001" / "logs" / "stream.ndjson"
        content = log_path.read_text()
        lines = content.strip().split("\n")
        assert len(lines) == 1

        data = json.loads(lines[0])
        assert data["type"] == "info"
        assert data["payload"]["message"] == "hello"

    def test_stream_output(self, temp_dir):
        stream = io.StringIO()
        logger = NDJSONLogger("exec-001", base_dir=temp_dir, stream=stream)
        logger.log(EventType.INFO, {"message": "streamed"})
        logger.close()

        stream.seek(0)
        content = stream.read()
        data = json.loads(content.strip())
        assert data["payload"]["message"] == "streamed"

    def test_frame_start_end(self, temp_dir):
        logger = NDJSONLogger("exec-001", base_dir=temp_dir)
        logger.frame_start(1, "initial")
        logger.frame_end(1, 50.5)
        logger.close()

        summary = logger.get_summary()
        assert summary.total_frames == 1
        assert summary.event_counts.get(EventType.FRAME_START) == 1
        assert summary.event_counts.get(EventType.FRAME_END) == 1

    def test_node_operations(self, temp_dir):
        logger = NDJSONLogger("exec-001", base_dir=temp_dir)
        logger.node_mount("node-1", "Agent", 1)
        logger.node_status("node-1", "running", 1)
        logger.close()

        log_path = Path(temp_dir) / "executions" / "exec-001" / "logs" / "stream.ndjson"
        lines = log_path.read_text().strip().split("\n")
        assert len(lines) == 2

        mount_event = json.loads(lines[0])
        assert mount_event["type"] == "node.mount"
        assert mount_event["node"] == "node-1"
        assert mount_event["payload"]["node_type"] == "Agent"

    def test_task_lifecycle(self, temp_dir):
        logger = NDJSONLogger("exec-001", base_dir=temp_dir)
        logger.task_start("task-1", "node-1", 1)
        logger.task_end("task-1", "node-1", 1, "completed", 100.0)
        logger.close()

        summary = logger.get_summary()
        assert summary.event_counts.get(EventType.TASK_START) == 1
        assert summary.event_counts.get(EventType.TASK_END) == 1

    def test_task_error(self, temp_dir):
        logger = NDJSONLogger("exec-001", base_dir=temp_dir)
        logger.task_error("task-1", "node-1", "Something failed", 1)
        logger.close()

        log_path = Path(temp_dir) / "executions" / "exec-001" / "logs" / "stream.ndjson"
        data = json.loads(log_path.read_text().strip())
        assert data["type"] == "task.error"
        assert data["payload"]["error"] == "Something failed"

    def test_state_change(self, temp_dir):
        logger = NDJSONLogger("exec-001", base_dir=temp_dir)
        logger.state_change("counter", 0, 1, "increment", 1)
        logger.close()

        log_path = Path(temp_dir) / "executions" / "exec-001" / "logs" / "stream.ndjson"
        data = json.loads(log_path.read_text().strip())
        assert data["type"] == "state.change"
        assert data["payload"]["key"] == "counter"
        assert data["payload"]["old"] == 0
        assert data["payload"]["new"] == 1

    def test_error_warning_tracking(self, temp_dir):
        logger = NDJSONLogger("exec-001", base_dir=temp_dir)
        logger.error("Error 1")
        logger.error("Error 2")
        logger.warning("Warning 1")
        logger.close()

        summary = logger.get_summary()
        assert summary.errors == 2
        assert summary.warnings == 1

    def test_summary_file_written(self, temp_dir):
        logger = NDJSONLogger("exec-001", base_dir=temp_dir)
        logger.log(EventType.INFO, {"test": True})
        logger.close()

        summary_path = Path(temp_dir) / "executions" / "exec-001" / "logs" / "stream.summary.json"
        assert summary_path.exists()

        data = json.loads(summary_path.read_text())
        assert data["execution_id"] == "exec-001"
        assert data["total_events"] == 1

    def test_event_counts(self, temp_dir):
        logger = NDJSONLogger("exec-001", base_dir=temp_dir)
        logger.frame_start(1, "test")
        logger.frame_start(2, "test")
        logger.frame_end(1, 10)
        logger.frame_end(2, 20)
        logger.error("oops")
        logger.close()

        summary = logger.get_summary()
        assert summary.event_counts[EventType.FRAME_START] == 2
        assert summary.event_counts[EventType.FRAME_END] == 2
        assert summary.event_counts[EventType.ERROR] == 1
        assert summary.total_frames == 2

    def test_timestamps_tracked(self, temp_dir):
        logger = NDJSONLogger("exec-001", base_dir=temp_dir)
        logger.log(EventType.INFO, {"first": True})
        logger.log(EventType.INFO, {"last": True})
        logger.close()

        summary = logger.get_summary()
        assert summary.first_timestamp is not None
        assert summary.last_timestamp is not None
        assert summary.first_timestamp <= summary.last_timestamp


class TestSummarizationConfig:
    """Tests for log summarization."""

    @pytest.fixture
    def temp_dir(self):
        d = tempfile.mkdtemp()
        yield d
        shutil.rmtree(d)

    def test_truncation_after_threshold(self, temp_dir):
        config = SummarizationConfig(
            max_events_before_summary=5,
            truncate_after_events=10,
            keep_events=[EventType.ERROR, EventType.FRAME_START],
        )
        logger = NDJSONLogger("exec-001", base_dir=temp_dir, config=config)

        # Log 15 INFO events (should be truncated after 10)
        for i in range(15):
            logger.log(EventType.INFO, {"i": i})

        # Log important events (should NOT be truncated)
        logger.error("important error")
        logger.frame_start(1, "important")

        logger.close()

        log_path = Path(temp_dir) / "executions" / "exec-001" / "logs" / "stream.ndjson"
        lines = log_path.read_text().strip().split("\n")

        # Count written events
        written_types = [json.loads(line)["type"] for line in lines]

        # INFO events written before truncation (threshold at 10)
        # Summarization notice logged at event 5, counts as event 6
        # Events 1-5 INFO, event 6 INFO (summarization), events 7-10 INFO = 10 total before truncation
        # After truncation: INFO is dropped, but ERROR and FRAME_START kept
        info_count = written_types.count("info")
        error_count = written_types.count("error")
        frame_start_count = written_types.count("frame.start")

        # Verify truncation happened - INFO events stop being written after threshold
        assert info_count < 15  # Some INFO events truncated
        assert error_count == 1  # ERROR is in keep_events
        assert frame_start_count == 1  # FRAME_START is in keep_events

    def test_summary_counts_all_events(self, temp_dir):
        config = SummarizationConfig(
            max_events_before_summary=5,
            truncate_after_events=10,
        )
        logger = NDJSONLogger("exec-001", base_dir=temp_dir, config=config)

        # Even truncated events should be counted in summary
        for i in range(20):
            logger.log(EventType.INFO, {"i": i})

        logger.close()

        summary = logger.get_summary()
        # 20 INFO + 1 summarization notice
        assert summary.total_events == 21


class TestCreateLogger:
    """Tests for factory function."""

    @pytest.fixture
    def temp_dir(self):
        d = tempfile.mkdtemp()
        yield d
        shutil.rmtree(d)

    def test_create_logger(self, temp_dir):
        logger = create_logger("exec-factory", base_dir=temp_dir)
        assert isinstance(logger, NDJSONLogger)
        assert logger.execution_id == "exec-factory"
        logger.close()

    def test_create_logger_with_stream(self, temp_dir):
        stream = io.StringIO()
        logger = create_logger("exec-stream", base_dir=temp_dir, stream=stream)
        logger.log(EventType.INFO, {"test": True})
        logger.close()

        stream.seek(0)
        assert len(stream.read()) > 0


class TestSafeSerialize:
    """Tests for safe serialization."""

    @pytest.fixture
    def temp_dir(self):
        d = tempfile.mkdtemp()
        yield d
        shutil.rmtree(d)

    def test_serializes_basic_types(self, temp_dir):
        logger = NDJSONLogger("exec-001", base_dir=temp_dir)
        logger.state_change("key", {"nested": [1, 2, 3]}, "string", "test", 1)
        logger.close()

        log_path = Path(temp_dir) / "executions" / "exec-001" / "logs" / "stream.ndjson"
        data = json.loads(log_path.read_text().strip())
        assert data["payload"]["old"] == {"nested": [1, 2, 3]}
        assert data["payload"]["new"] == "string"

    def test_serializes_unserializable_as_string(self, temp_dir):
        logger = NDJSONLogger("exec-001", base_dir=temp_dir)

        class CustomObj:
            def __str__(self):
                return "CustomObj()"

        logger.state_change("key", CustomObj(), "new", "test", 1)
        logger.close()

        log_path = Path(temp_dir) / "executions" / "exec-001" / "logs" / "stream.ndjson"
        data = json.loads(log_path.read_text().strip())
        assert data["payload"]["old"] == "CustomObj()"


class TestHandlerInvoke:
    """Tests for handler invocation logging."""

    @pytest.fixture
    def temp_dir(self):
        d = tempfile.mkdtemp()
        yield d
        shutil.rmtree(d)

    def test_handler_invoke_basic(self, temp_dir):
        logger = NDJSONLogger("exec-001", base_dir=temp_dir)
        logger.handler_invoke("on_complete", "node-1", 1)
        logger.close()

        log_path = Path(temp_dir) / "executions" / "exec-001" / "logs" / "stream.ndjson"
        data = json.loads(log_path.read_text().strip())
        assert data["type"] == "handler.invoke"
        assert data["payload"]["handler"] == "on_complete"
        assert "result" not in data["payload"]

    def test_handler_invoke_with_result(self, temp_dir):
        logger = NDJSONLogger("exec-001", base_dir=temp_dir)
        logger.handler_invoke("on_complete", "node-1", 1, result={"status": "ok"})
        logger.close()

        log_path = Path(temp_dir) / "executions" / "exec-001" / "logs" / "stream.ndjson"
        data = json.loads(log_path.read_text().strip())
        assert data["payload"]["result"] == {"status": "ok"}
