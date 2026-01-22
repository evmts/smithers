"""NDJSON logging for Smithers orchestration.

Provides structured NDJSON event logging with:
- Per-execution log files
- Summarization at configurable thresholds
- Event type tracking and counts
- Stream and file output modes
"""

import json
import os
import time
from datetime import datetime, timezone
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Dict, List, Optional, TextIO
from enum import Enum


class EventType(str, Enum):
    """Standard event types for logging."""
    FRAME_START = "frame.start"
    FRAME_END = "frame.end"
    NODE_MOUNT = "node.mount"
    NODE_UNMOUNT = "node.unmount"
    NODE_STATUS = "node.status"
    TASK_START = "task.start"
    TASK_END = "task.end"
    TASK_ERROR = "task.error"
    STATE_CHANGE = "state.change"
    AGENT_TOKEN = "agent.token"
    AGENT_TOOL = "agent.tool"
    TOOL_CALL = "tool.call"
    TOOL_RESULT = "tool.result"
    HANDLER_INVOKE = "handler.invoke"
    EFFECT_RUN = "effect.run"
    APPROVAL_REQUEST = "approval.request"
    APPROVAL_RESPONSE = "approval.response"
    ERROR = "error"
    WARNING = "warning"
    INFO = "info"


@dataclass
class LogEvent:
    """A single log event."""
    timestamp: str
    event_type: str
    execution_id: str
    payload: Dict[str, Any]
    frame_id: Optional[int] = None
    node_id: Optional[str] = None
    task_id: Optional[str] = None

    def to_ndjson(self) -> str:
        """Serialize to NDJSON line."""
        data = {
            "ts": self.timestamp,
            "type": self.event_type,
            "exec": self.execution_id,
            "payload": self.payload,
        }
        if self.frame_id is not None:
            data["frame"] = self.frame_id
        if self.node_id:
            data["node"] = self.node_id
        if self.task_id:
            data["task"] = self.task_id
        return json.dumps(data, separators=(',', ':'))


@dataclass
class LogSummary:
    """Summary statistics for a log file."""
    execution_id: str
    total_events: int = 0
    event_counts: Dict[str, int] = field(default_factory=dict)
    first_timestamp: Optional[str] = None
    last_timestamp: Optional[str] = None
    total_frames: int = 0
    errors: int = 0
    warnings: int = 0

    def to_dict(self) -> Dict[str, Any]:
        return {
            "execution_id": self.execution_id,
            "total_events": self.total_events,
            "event_counts": self.event_counts,
            "first_timestamp": self.first_timestamp,
            "last_timestamp": self.last_timestamp,
            "total_frames": self.total_frames,
            "errors": self.errors,
            "warnings": self.warnings,
        }


@dataclass
class SummarizationConfig:
    """Configuration for log summarization."""
    max_events_before_summary: int = 10000
    truncate_after_events: int = 50000
    keep_events: List[str] = field(default_factory=lambda: [
        EventType.FRAME_START,
        EventType.FRAME_END,
        EventType.ERROR,
        EventType.WARNING,
        EventType.NODE_STATUS,
    ])
    summarize_verbose: List[str] = field(default_factory=lambda: [
        EventType.AGENT_TOKEN,
        EventType.TOOL_CALL,
        EventType.TOOL_RESULT,
    ])


class NDJSONLogger:
    """NDJSON event logger for Smithers executions.

    Writes events to:
    - .smithers/executions/{execution_id}/logs/stream.ndjson
    - .smithers/executions/{execution_id}/logs/stream.summary.json
    """

    def __init__(
        self,
        execution_id: str,
        base_dir: str = ".smithers",
        config: Optional[SummarizationConfig] = None,
        stream: Optional[TextIO] = None,
    ):
        self.execution_id = execution_id
        self.base_dir = Path(base_dir)
        self.config = config or SummarizationConfig()
        self.stream = stream

        # Tracking
        self.summary = LogSummary(execution_id=execution_id)
        self._file: Optional[TextIO] = None
        self._summarizing = False

        # Initialize log directory
        self._init_log_dir()

    def _init_log_dir(self) -> None:
        """Create log directory structure."""
        log_dir = self.base_dir / "executions" / self.execution_id / "logs"
        log_dir.mkdir(parents=True, exist_ok=True)
        self._log_path = log_dir / "stream.ndjson"
        self._summary_path = log_dir / "stream.summary.json"

    def _open_file(self) -> TextIO:
        """Open log file for appending."""
        if self._file is None:
            self._file = open(self._log_path, 'a', encoding='utf-8')
        return self._file

    def log(
        self,
        event_type: str,
        payload: Dict[str, Any],
        frame_id: Optional[int] = None,
        node_id: Optional[str] = None,
        task_id: Optional[str] = None,
    ) -> None:
        """Log an event."""
        timestamp = datetime.now(timezone.utc).isoformat()

        event = LogEvent(
            timestamp=timestamp,
            event_type=event_type,
            execution_id=self.execution_id,
            payload=payload,
            frame_id=frame_id,
            node_id=node_id,
            task_id=task_id,
        )

        # Update summary
        self._update_summary(event)

        # Check summarization threshold
        if self.summary.total_events >= self.config.truncate_after_events:
            if event_type not in self.config.keep_events:
                return  # Drop verbose events

        # Write event
        line = event.to_ndjson() + "\n"

        if self.stream:
            self.stream.write(line)
            self.stream.flush()

        f = self._open_file()
        f.write(line)
        f.flush()

    def _update_summary(self, event: LogEvent) -> None:
        """Update summary statistics."""
        self.summary.total_events += 1

        # Track event counts
        self.summary.event_counts[event.event_type] = (
            self.summary.event_counts.get(event.event_type, 0) + 1
        )

        # Track timestamps
        if self.summary.first_timestamp is None:
            self.summary.first_timestamp = event.timestamp
        self.summary.last_timestamp = event.timestamp

        # Track frame count
        if event.event_type == EventType.FRAME_END:
            self.summary.total_frames += 1

        # Track errors/warnings
        if event.event_type == EventType.ERROR:
            self.summary.errors += 1
        elif event.event_type == EventType.WARNING:
            self.summary.warnings += 1

        # Check if we should start summarizing
        if (not self._summarizing and
            self.summary.total_events >= self.config.max_events_before_summary):
            self._summarizing = True
            self.log(
                EventType.INFO,
                {"message": f"Log summarization active after {self.summary.total_events} events"}
            )

    def frame_start(self, frame_id: int, reason: str) -> None:
        """Log frame start."""
        self.log(EventType.FRAME_START, {"reason": reason}, frame_id=frame_id)

    def frame_end(self, frame_id: int, duration_ms: float) -> None:
        """Log frame end."""
        self.log(EventType.FRAME_END, {"duration_ms": duration_ms}, frame_id=frame_id)

    def node_mount(self, node_id: str, node_type: str, frame_id: int) -> None:
        """Log node mount."""
        self.log(
            EventType.NODE_MOUNT,
            {"node_type": node_type},
            frame_id=frame_id,
            node_id=node_id
        )

    def node_status(self, node_id: str, status: str, frame_id: int) -> None:
        """Log node status change."""
        self.log(
            EventType.NODE_STATUS,
            {"status": status},
            frame_id=frame_id,
            node_id=node_id
        )

    def task_start(self, task_id: str, node_id: str, frame_id: int) -> None:
        """Log task start."""
        self.log(
            EventType.TASK_START,
            {},
            frame_id=frame_id,
            node_id=node_id,
            task_id=task_id
        )

    def task_end(
        self,
        task_id: str,
        node_id: str,
        frame_id: int,
        status: str,
        duration_ms: float
    ) -> None:
        """Log task end."""
        self.log(
            EventType.TASK_END,
            {"status": status, "duration_ms": duration_ms},
            frame_id=frame_id,
            node_id=node_id,
            task_id=task_id
        )

    def task_error(self, task_id: str, node_id: str, error: str, frame_id: int) -> None:
        """Log task error."""
        self.log(
            EventType.TASK_ERROR,
            {"error": error},
            frame_id=frame_id,
            node_id=node_id,
            task_id=task_id
        )

    def state_change(
        self,
        key: str,
        old_value: Any,
        new_value: Any,
        trigger: str,
        frame_id: int
    ) -> None:
        """Log state change."""
        self.log(
            EventType.STATE_CHANGE,
            {
                "key": key,
                "old": self._safe_serialize(old_value),
                "new": self._safe_serialize(new_value),
                "trigger": trigger,
            },
            frame_id=frame_id
        )

    def handler_invoke(
        self,
        handler_name: str,
        node_id: str,
        frame_id: int,
        result: Optional[Any] = None
    ) -> None:
        """Log handler invocation."""
        payload = {"handler": handler_name}
        if result is not None:
            payload["result"] = self._safe_serialize(result)
        self.log(
            EventType.HANDLER_INVOKE,
            payload,
            frame_id=frame_id,
            node_id=node_id
        )

    def error(self, message: str, details: Optional[Dict[str, Any]] = None) -> None:
        """Log error."""
        payload = {"message": message}
        if details:
            payload["details"] = details
        self.log(EventType.ERROR, payload)

    def warning(self, message: str, details: Optional[Dict[str, Any]] = None) -> None:
        """Log warning."""
        payload = {"message": message}
        if details:
            payload["details"] = details
        self.log(EventType.WARNING, payload)

    def _safe_serialize(self, value: Any) -> Any:
        """Safely serialize a value for logging."""
        try:
            json.dumps(value)
            return value
        except (TypeError, ValueError):
            return str(value)

    def get_summary(self) -> LogSummary:
        """Get current summary."""
        return self.summary

    def write_summary(self) -> None:
        """Write summary file."""
        with open(self._summary_path, 'w', encoding='utf-8') as f:
            json.dump(self.summary.to_dict(), f, indent=2)

    def close(self) -> None:
        """Close logger and write final summary."""
        self.write_summary()
        if self._file:
            self._file.close()
            self._file = None


def create_logger(
    execution_id: str,
    base_dir: str = ".smithers",
    stream: Optional[TextIO] = None,
) -> NDJSONLogger:
    """Create a logger for an execution."""
    return NDJSONLogger(execution_id, base_dir, stream=stream)
