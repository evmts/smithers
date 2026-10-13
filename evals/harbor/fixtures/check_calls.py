"""Offline behavioral checks of the per-call records: no docker, model or runner.

    python3 -B fixtures/check_calls.py

A synthetic harness journal and a synthetic Codex session log, with every
time a fixed constant. What is pinned, and why each one matters:

  - Every model call is a row. A frame whose first reply was rejected asks
    the model again; both replies are trajectory steps and their tokens sum
    to the totals Harbor reads. A trajectory with one row per frame reported
    16 calls and held 15.
  - Totals by purpose sum to the run's own ledger (`flows.agent.usage.v1`),
    so judge readings, compaction calls and the cell's own evaluator readings
    are in a total. A call whose tokens are known only as a sum is named.
  - The time split is exclusive and sums to the span: a judge reading that
    ran under a model call costs no wall clock, one that held the frame does.
  - A journal written before any of these fields existed still folds, a
    field the harness adds later is read as written, not derived, and a
    payload of a shape nobody expected costs a row its value, never the fold.
  - The Codex session log gives the same rows, the session's effort, summary
    setting and CLI version, and none of the ids the log carries.
  - The fit recovers known coefficients and refuses a degenerate sample.
"""
from __future__ import annotations

import json
import os
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent))

import calls  # noqa: E402
import smithers_agent as agent  # noqa: E402

T0 = 1_700_000_000_000
# The trail is flushed in batches: a row's `emitted_at_ms` trails the time
# its payload names. A fold that read the row's time would be off by this.
FLUSH_LAG = 150
JUDGE = "judge-model"
SEAT = "seat-model"


def usage(input_tokens: int, cached: int | None, output: int, thinking: int | None = None) -> dict:
    counters = {"inputTokens": input_tokens, "outputTokens": output, "totalTokens": input_tokens + output}
    if cached is not None:
        counters["cachedInputTokens"] = cached
    if thinking is not None:
        counters["reasoningTokens"] = thinking
    return counters


def ledger(key: str, spent: int) -> tuple:
    return ("flows.agent.usage.v1", None, {"stepKey": key, "spent": spent, "costSource": "estimated"})


def engine_ledger(key: str, spent: int) -> tuple:
    return ("control.engine.event", None, {"eventType": "flows.agent.usage.v1",
                                           "payload": {"stepKey": key, "spent": spent}})


def requested(at: int, frame: int, attempt: int = 1, purpose: str = "frame") -> tuple:
    return ("control.agent.model-requested", at, {"frame": frame, "attempt": attempt, "purpose": purpose,
                                                  "modelId": SEAT, "routeId": "route", "protocolId": "protocol",
                                                  "params": {"reasoningEffort": "xhigh"}})


def journal() -> list[dict]:
    """One run: four frames, a rejected reply, a retry, a compaction, every
    kind of judge reading, and a last call the budget killed."""
    judged = {"modelId": JUDGE}
    rows = [
        ("control.run.running", None, {}),
        ("control.agent.decision-settled", 1_000, {"classifier": "relevance/unnecessary", "frame": 0, "latencyMs": 600,
                                                   "usage": {"inputTokens": 1_400, "outputTokens": 20, **judged}}),
        ("control.agent.relevance-settled", 1_000, {"frame": 0, "latencyMs": 600,
                                                    "usage": {"inputTokens": 1_400, "outputTokens": 20}}),
        ledger("boundary-usage/key1_a", 1_420),
        ("control.agent.turn-opened", 1_000, {"seat": "openai:seat-model"}),
        requested(1_000, 0),
        ledger("key1_b", 5_500),
        ("control.agent.model-settled", 11_000, {"durationMillis": 10_000, "text": "first reply",
                                                 "usage": usage(5_000, 0, 500, 200)}),
        ("control.agent.cell-produced", 11_000, {"cell": {"text": "await bash()"}}),
        ("control.agent.cell-call-started", 11_100, {"callId": "c1", "flowName": "bash", "input": {"command": "ls"}}),
        ("control.agent.cell-call-settled", 12_100, {"callId": "c1", "flowName": "bash", "outcome": "success",
                                                     "value": {"exitCode": 0}}),
        ("control.agent.cell-call-started", 12_100, {"callId": "c2", "flowName": "jev", "input": {"questions": {}}}),
        ("control.agent.cell-call-settled", 12_400, {"callId": "c2", "flowName": "jev", "outcome": "success",
                                                     "value": {"answers": {}, "latencyMs": 250,
                                                               "usage": {"inputTokens": 700, "outputTokens": 60}}}),
        engine_ledger("call-reading/key1_c/receipt/0", 760),
        ("control.agent.turn-closed", 12_500, {"outcome": "continue"}),
        ("control.agent.turn-opened", 12_500, {"seat": "openai:seat-model"}),
        requested(12_500, 1),
        ledger("boundary-usage/key1_d", 3_240),
        ("control.agent.decision-settled", 12_800, {"classifier": "supervisor/turn", "frame": 0, "latencyMs": 250}),
        ("control.agent.supervisor-settled", 12_800, {"frame": 0, "latencyMs": 250,
                                                      "usage": {"inputTokens": 3_000, "outputTokens": 240, **judged}}),
        ledger("key1_e", 6_600),
        ("control.agent.model-settled", 32_500, {"durationMillis": 20_000, "text": "a reply that did not compile",
                                                 "usage": usage(6_000, 4_000, 600, 300)}),
        ("control.agent.cell-rejected-in-frame", 32_500, {"attempt": 1, "code": "compile_failed",
                                                          "message": "The cell did not compile"}),
        requested(32_500, 1, attempt=2),
        ("control.agent.model-retried", 40_000, {"attempt": 1, "code": "transport", "delayMillis": 900}),
        ledger("key1_f", 7_700),
        ("control.agent.model-settled", 47_500, {"durationMillis": 15_000, "text": "second reply",
                                                 "usage": usage(7_000, 6_000, 700, 100)}),
        ("control.agent.cell-produced", 47_500, {"cell": {"text": "await bash()"}}),
        ("control.agent.cell-call-started", 47_600, {"callId": "c3", "flowName": "bash", "input": {"command": "make"}}),
        ("control.agent.cell-call-settled", 49_600, {"callId": "c3", "flowName": "bash", "outcome": "success",
                                                     "value": {"exitCode": 0}}),
        ("control.agent.turn-closed", 49_700, {"outcome": "continue"}),
        requested(49_700, 2, purpose="compaction"),
        ledger("boundary-usage/key1_g", 2_040),
        ("control.agent.decision-settled", 49_900, {"classifier": "compaction/marks", "frame": 1, "latencyMs": 150,
                                                    "usage": {"inputTokens": 2_000, "outputTokens": 40, **judged}}),
        ledger("key1_h", 9_000),
        ("control.agent.compaction-settled", 59_700, {"marks": {"kept": 1, "removed": 0, "squashed": 2},
                                                      "removedTokens": "[REDACTED]"}),
        ("control.agent.turn-opened", 59_700, {"seat": "openai:seat-model"}),
        requested(59_700, 2),
        ledger("key1_i", 8_800),
        ("control.agent.model-settled", 67_700, {"durationMillis": 8_000, "text": "third reply",
                                                 "usage": usage(8_000, 7_000, 800, 400)}),
        ledger("boundary-usage/key1_j", 26_200),
        ("control.agent.decision-settled", 68_500, {"classifier": "completion/claim", "frame": 2, "latencyMs": 800}),
        ("control.agent.claim-demanded", 68_500, {"latencyMs": 800, "demanded": True, "nextFrame": 3,
                                                  "usage": {"inputTokens": 26_000, "outputTokens": 200, **judged}}),
        ("control.agent.turn-closed", 68_500, {"outcome": "continue"}),
        ("control.agent.turn-opened", 68_500, {"seat": "openai:seat-model"}),
        requested(68_500, 3),
        ("control.status.observed", None, {}),
    ]
    events = []
    clock = T0
    for seq, (kind, at, payload) in enumerate(rows):
        if at is not None:
            clock = T0 + at
            payload = {**payload, "at": clock}
        elif kind == "control.status.observed":
            clock = T0 + 70_000
        events.append({"seq": seq, "at": clock + (FLUSH_LAG if at is not None else 0), "type": kind, "payload": payload})
    return events


def stamp(offset: int) -> str:
    return agent._iso(T0 + offset)


SESSION_BASE = "2026-01-01T00:00:"
SESSION_EPOCH = 1_767_225_600_000  # 2026-01-01T00:00:00Z
ACCOUNT = "acct-do-not-copy"


def session() -> list[str]:
    """One Codex session: three requests, three tool outputs, one compaction."""
    def line(second: float, kind: str, payload: dict) -> str:
        return json.dumps({"timestamp": f"{SESSION_BASE}{second:06.3f}Z", "type": kind, "payload": payload})

    def record(input_tokens: int, cached: int, output: int, thinking: int) -> dict:
        return {"usage": {"input_tokens": input_tokens, "cached_input_tokens": cached, "output_tokens": output,
                          "reasoning_output_tokens": thinking, "total_tokens": input_tokens + output},
                "response_id": "resp-do-not-copy"}

    return [
        line(0, "session_meta", {"cli_version": "0.160.0", "creator_account_id": ACCOUNT, "creator_user_id": ACCOUNT,
                                 "model_provider": "openai", "originator": "codex_exec"}),
        line(0, "event_msg", {"type": "task_started"}),
        line(1, "response_item", {"type": "message", "role": "developer"}),
        line(1, "turn_context", {"model": SEAT, "effort": "xhigh", "summary": "none"}),
        line(1, "response_item", {"type": "message", "role": "user"}),
        line(3, "event_msg", {"type": "item_completed", "item": {"type": "AgentMessage"},
                              "started_at_ms": SESSION_EPOCH + 2_200, "completed_at_ms": SESSION_EPOCH + 3_000}),
        line(3, "response_item", {"type": "message", "role": "assistant"}),
        line(5, "response_item", {"type": "custom_tool_call", "name": "exec"}),
        line(5, "token_usage_record", record(12_000, 9_000, 200, 0)),
        line(5.5, "response_item", {"type": "custom_tool_call_output"}),
        line(5.5, "event_msg", {"type": "token_count"}),
        line(7.5, "event_msg", {"type": "item_completed", "item": {"type": "Reasoning"},
                                "started_at_ms": SESSION_EPOCH + 7_500, "completed_at_ms": SESSION_EPOCH + 7_500}),
        line(7.5, "response_item", {"type": "reasoning"}),
        line(15.5, "response_item", {"type": "custom_tool_call", "name": "exec"}),
        line(15.5, "response_item", {"type": "function_call", "name": "shell"}),
        line(15.5, "token_usage_record", record(13_000, 12_000, 400, 300)),
        line(16, "response_item", {"type": "custom_tool_call_output"}),
        line(17.5, "response_item", {"type": "function_call_output"}),
        line(17.5, "compacted", {"message": "summary"}),
        "not json",
        line(19, "response_item", {"type": "reasoning"}),
        line(21.5, "response_item", {"type": "message", "role": "assistant"}),
        line(21.5, "token_usage_record", record(14_000, 13_000, 300, 100)),
        line(21.5, "event_msg", {"type": "task_complete"}),
    ]


class JournalFold(unittest.TestCase):
    def setUp(self) -> None:
        self.events = journal()
        self.folded = calls.fold_journal(self.events)
        self.rows = self.folded["calls"]

    def test_every_model_call_is_a_row_with_its_purpose(self) -> None:
        self.assertEqual(
            [(row["purpose"], row["start"], row["durationMs"]) for row in self.rows],
            [("relevance", stamp(400), 600),
             ("frame", stamp(1_000), 10_000),
             ("reading", stamp(12_150), 250),
             ("frame", stamp(12_500), 20_000),
             ("judge", stamp(12_550), 250),
             ("frame", stamp(32_500), 15_000),
             ("compaction", stamp(49_700), 10_000),
             ("marks", stamp(49_750), 150),
             ("frame", stamp(59_700), 8_000),
             ("claim", stamp(67_700), 800),
             ("frame", stamp(68_500), 1_500)],
        )
        frames = [row for row in self.rows if row["purpose"] == "frame"]
        self.assertEqual([(row["frame"], row["attempt"]) for row in frames], [(0, 1), (1, 1), (1, 2), (2, 1), (3, 1)])
        rejected = frames[1]
        self.assertEqual(rejected["rejected"], "compile_failed")
        self.assertEqual((rejected["inputTokens"], rejected["cachedTokens"], rejected["outputTokens"]), (6_000, 4_000, 600))
        self.assertEqual((rejected["thinkingTokens"], rejected["writtenTokens"]), (300, 300))
        self.assertEqual(frames[2]["retries"], 1)
        self.assertEqual(frames[2]["end"], stamp(47_500))
        self.assertEqual({row["model"] for row in frames}, {SEAT})
        self.assertEqual(self.rows[4]["model"], JUDGE)
        self.assertEqual([row["derived"] for row in frames[:4]], [["writtenTokens"]] * 4,
                         "this journal reports no written count, so it is output minus reasoning")
        self.assertEqual({tuple(row["derived"]) for row in self.rows if row["purpose"] in calls.READINGS}, {("purpose",)})

    def test_a_call_with_no_settle_record_is_reported_unsettled_with_its_elapsed_time(self) -> None:
        compaction = self.rows[6]
        self.assertFalse(compaction["settled"])
        self.assertEqual(self.folded["compactions"], [
            {"at": stamp(59_700), "frame": 2, "durationMs": 10_000, "summaryCall": True, "derived": ["durationMs"],
             "marks": {"kept": 1, "removed": 0, "squashed": 2}}], "the redacted count is not copied")
        self.assertIsNone(compaction["inputTokens"])
        self.assertEqual(compaction["totalTokens"], 9_000, "the ledger's spend under the open call")
        self.assertEqual(compaction["derived"], ["durationMs", "totalTokens"])
        killed = self.rows[-1]
        self.assertFalse(killed["settled"])
        self.assertIsNone(killed["totalTokens"])
        self.assertEqual((killed["end"], killed["derived"]), (stamp(70_000), ["durationMs", "end"]))
        self.assertTrue(all(row["settled"] for row in self.rows if row not in (compaction, killed)))

    def test_totals_by_purpose_sum_to_the_run_ledger(self) -> None:
        by_purpose, everything = self.folded["byPurpose"], self.folded["allPurposes"]
        self.assertEqual(by_purpose["frame"], {
            "calls": 5, "unsettled": 1, "tokenless": 1, "inputTokens": 26_000, "cachedTokens": 17_000,
            "outputTokens": 2_600, "thinkingTokens": 1_000, "writtenTokens": 1_600, "totalTokens": 28_600,
            "unsplitTokens": 0, "durationMs": 54_500,
        })
        self.assertEqual({purpose: total["totalTokens"] for purpose, total in by_purpose.items()},
                         {"frame": 28_600, "compaction": 9_000, "judge": 3_240, "marks": 2_040, "claim": 26_200,
                          "relevance": 1_420, "reading": 760})
        self.assertEqual(by_purpose["compaction"]["unsplitTokens"], 9_000)
        self.assertIsNone(by_purpose["compaction"]["inputTokens"], "a sum is not a split")
        for field in ("calls", "unsettled", "tokenless", "totalTokens", "unsplitTokens", "durationMs"):
            self.assertEqual(everything[field], sum(total[field] for total in by_purpose.values()), field)
        self.assertEqual(everything["totalTokens"], 71_260)
        self.assertEqual(self.folded["ledgerTokens"], 71_260, "every usage event, the engine's wrapped ones included")
        seat = agent.summarize(self.events)
        self.assertEqual(seat["modelCalls"], 4)
        self.assertEqual(seat["usage"], {"inputTokens": 26_000, "cachedInputTokens": 17_000, "outputTokens": 2_600,
                                         "reasoningTokens": 1_000}, "the figure Harbor reads is the frame calls alone")
        self.assertEqual(seat["byPurpose"], by_purpose)
        self.assertEqual((seat["allPurposes"], seat["ledgerTokens"], seat["time"], seat["compactions"]),
                         (everything, 71_260, self.folded["time"], self.folded["compactions"]))

    def test_the_time_split_is_exclusive_and_sums_to_the_span(self) -> None:
        time = self.folded["time"]
        self.assertEqual(time, {"spanMs": 70_000, "modelMs": 54_500, "compactionMs": 10_000, "commandsMs": 3_300,
                                "judgeMs": 1_400, "otherMs": 800})
        self.assertEqual(time["spanMs"], sum(value for name, value in time.items() if name != "spanMs"))
        readings = sum(self.folded["byPurpose"][purpose]["durationMs"] for purpose in ("judge", "marks", "claim", "relevance"))
        self.assertEqual(readings, 1_800, "every reading's latency, the 400 ms under a model call included")

    def test_the_trajectory_holds_one_step_per_model_call(self) -> None:
        document = agent.trajectory(self.events, agent_name="smithers", agent_version="test", seat="openai:seat-model",
                                    instruction="do it", session_id="trial")
        steps = document["steps"]
        self.assertEqual([step["step_id"] for step in steps], list(range(1, 7)))
        measured = [step for step in steps if step.get("metrics")]
        self.assertEqual(len(measured), agent.summarize(self.events)["modelCalls"])
        self.assertEqual([step["message"] for step in measured],
                         ["first reply", "a reply that did not compile", "second reply", "third reply"])
        self.assertEqual([(step["metrics"]["extra"]["frame"], step["metrics"]["extra"]["attempt"]) for step in measured],
                         [(0, 1), (1, 1), (1, 2), (2, 1)])
        self.assertEqual({step["metrics"]["extra"]["purpose"] for step in measured}, {"frame"})
        final = document["final_metrics"]
        for total, field in (("total_prompt_tokens", "prompt_tokens"), ("total_completion_tokens", "completion_tokens"),
                             ("total_cached_tokens", "cached_tokens")):
            self.assertEqual(final[total], sum(step["metrics"][field] for step in measured), total)
        self.assertEqual((final["total_prompt_tokens"], final["total_completion_tokens"], final["total_cached_tokens"]),
                         (26_000, 2_600, 17_000))
        rejected = steps[2]
        self.assertEqual(rejected["extra"]["rejected"], {"code": "compile_failed", "message": "The cell did not compile"})
        self.assertNotIn("tool_calls", rejected)
        self.assertEqual([call["function_name"] for call in steps[1]["tool_calls"]], ["bash", "jev"])
        self.assertEqual([call["arguments"] for call in steps[3]["tool_calls"]], [{"command": "make"}])
        self.assertEqual(len({call["tool_call_id"] for step in steps for call in step.get("tool_calls", [])}), 3)
        self.assertNotIn("metrics", steps[5], "the call the budget killed settled nothing")
        self.assertEqual(document["extra"]["calls"], self.rows)
        self.assertEqual(final["extra"]["byPurpose"], self.folded["byPurpose"])
        self.assertEqual(final["extra"]["allPurposes"], self.folded["allPurposes"])
        self.assertEqual((final["extra"]["ledgerTokens"], final["extra"]["time"], final["extra"]["compactions"]),
                         (71_260, self.folded["time"], self.folded["compactions"]))
        self.assertEqual(final["extra"]["cached_share"], 17_000 / 26_000)

    def test_the_trajectory_is_valid_atif(self) -> None:
        try:
            from harbor.models.trajectories import Trajectory  # type: ignore[import-not-found]
        except ImportError:
            if os.environ.get("HARBOR_PYTHON"):
                raise
            self.skipTest("harbor not importable")
        document = agent.trajectory(self.events, agent_name="smithers", agent_version="test", seat="openai:seat-model",
                                    instruction="do it", session_id="trial")
        validated = Trajectory.model_validate(document)
        self.assertEqual(len(validated.extra["calls"]), len(self.rows))
        self.assertEqual(validated.steps[2].extra["rejected"]["code"], "compile_failed")

    def test_a_journal_from_before_these_fields_still_folds(self) -> None:
        old = [
            {"seq": 0, "at": T0, "type": "control.agent.turn-opened", "payload": {"seat": "s"}},
            {"seq": 1, "at": T0, "type": "control.agent.model-requested", "payload": {"routeId": "codex"}},
            {"seq": 2, "at": T0 + 4_000, "type": "control.agent.model-settled",
             "payload": {"text": "a", "usage": {"inputTokens": 100, "cachedInputTokens": 40, "outputTokens": 9}}},
            {"seq": 3, "at": T0 + 4_000, "type": "control.agent.cell-call-started", "payload": {"flowName": "bash"}},
            {"seq": 4, "at": T0 + 5_000, "type": "control.agent.cell-call-settled", "payload": {"flowName": "bash"}},
            {"seq": 5, "at": T0 + 5_000, "type": "control.agent.model-settled",
             "payload": {"text": "no request before it", "durationMillis": 700, "usage": {}}},
            {"seq": 6, "at": T0 + 6_000, "type": "control.run.completed", "payload": {}},
        ]
        folded = calls.fold_journal(old)
        first, orphan = folded["calls"]
        self.assertEqual((first["purpose"], first["durationMs"], first["derived"]), ("frame", 4_000, ["durationMs", "purpose"]))
        self.assertEqual((first["thinkingTokens"], first["writtenTokens"], first["totalTokens"]), (None, None, 109))
        self.assertEqual((orphan["start"], orphan["end"], orphan["durationMs"]), (stamp(4_300), stamp(5_000), 700))
        self.assertIsNone(orphan["totalTokens"])
        self.assertIsNone(folded["ledgerTokens"], "no ledger was written, which is not a ledger of zero")
        self.assertEqual(folded["byPurpose"]["frame"]["tokenless"], 1)
        self.assertEqual(folded["time"], {"spanMs": 6_000, "modelMs": 4_700, "compactionMs": 0, "commandsMs": 300,
                                          "judgeMs": 0, "otherMs": 1_000})
        self.assertEqual(folded["compactions"], [])
        self.assertEqual(calls.fold_journal([]), {"calls": [], "byPurpose": {}, "allPurposes": calls.totals([])["allPurposes"],
                                                  "ledgerTokens": None, "time": None, "compactions": []})

    def test_a_payload_of_the_wrong_shape_never_ends_the_fold(self) -> None:
        """The fold runs after the model work is paid for: a field of a type
        nobody expected must cost a row its value, never the trial its record."""
        kinds = ["control.agent.model-requested", "control.agent.model-settled", "control.agent.model-retried",
                 "control.agent.compaction-settled", "control.agent.cell-rejected-in-frame",
                 "control.agent.decision-settled", "control.agent.supervisor-settled", "control.agent.claim-demanded",
                 "control.agent.relevance-settled", "control.agent.cell-call-started",
                 "control.agent.cell-call-settled", "control.engine.event", "flows.agent.usage.v1",
                 "control.agent.turn-opened"]
        fields = ["at", "purpose", "frame", "attempt", "modelId", "usage", "durationMillis", "timing", "servedTier",
                  "marks", "code", "classifier", "latencyMs", "callId", "flowName", "value", "eventType", "payload",
                  "stepKey", "spent", "text", "cell", "message"]
        for wrong in (None, "text", 3.5, True, [1], {"usage": "x", "latencyMs": [], "inputTokens": "many"}):
            events = [{"seq": seq, "at": T0 + seq, "type": kind, "payload": {field: wrong for field in fields}}
                      for seq, kind in enumerate(kinds * 2)]
            folded = calls.fold_journal(events)
            self.assertEqual(folded["allPurposes"]["calls"], len(folded["calls"]), repr(wrong))
            self.assertGreaterEqual(len(folded["calls"]), 2, "the calls are still rows")
            json.dumps(folded)
        self.assertEqual(calls.fold_session(['{"timestamp": 5}', '[]', '{"timestamp": "2026-01-01T00:00:00Z", "type": 7, '
                                             '"payload": []}', '{"timestamp": "2026-01-01T00:00:01Z", '
                                             '"type": "token_usage_record", "payload": {"usage": {"input_tokens": "x"}}}'])
                         ["calls"][0]["totalTokens"], None)

    def test_fields_the_harness_adds_are_read_as_written(self) -> None:
        """The journal since #3844: a settle names its own request, when its
        stream reached each stage, its tries and its written tokens, and a
        compaction says why it ran, how long it took and what its summary
        call spent."""
        stages = {"firstEventMs": 7_000, "firstThinkingMs": 7_100, "firstOutputMs": 9_000, "lastOutputMs": 11_500}
        timing = {"attempts": 2, "requestBytes": 48_211, "signedMs": 3, "sentMs": 9, "headersMs": 6_900,
                  "firstEventMs": 6_950, "completedMs": 11_900, "closedMs": 11_950}
        marks = {"kept": 2, "removed": 1, "squashed": 3}
        events = [{"seq": seq, "at": T0, "type": f"control.agent.{kind}", "payload": {**payload, "at": T0 + at}}
                  for seq, (kind, at, payload) in enumerate([
                      ("model-requested", 0, {"frame": 4, "attempt": 1, "purpose": "frame", "modelId": SEAT}),
                      ("model-settled", 12_000, {"durationMillis": 12_000, "frame": 4, "attempt": 2, "purpose": "frame",
                                                 "reask": "compile_failed", "stages": stages, "tries": 2,
                                                 "output": {"thinking": 100, "written": 290}, "timing": timing,
                                                 "servedTier": "priority", "usage": usage(9_000, 0, 400, 100)}),
                      ("model-requested", 13_000, {"frame": 5, "attempt": 1, "purpose": "compaction", "modelId": SEAT}),
                      ("compaction-settled", 30_000, {
                          "frame": 5, "durationMillis": 16_500, "causes": ["outdated_context", "budget"], "marks": marks,
                          "context": {"before": 250_000, "after": 60_000}, "removed": 1_200,
                          "marksCall": {"requests": 1, "latencyMs": 300, "usage": {"inputTokens": 2_000, "outputTokens": 40}},
                          "summaryCall": {"durationMillis": 15_000, "stages": {"firstEventMs": 6_000}, "tries": 1,
                                          "output": {"thinking": 200, "written": 700},
                                          "usage": usage(8_000, 0, 900, 200)}}),
                      ("compaction-settled", 40_000, {"frame": 7, "durationMillis": 800, "causes": ["irrelevant_context"],
                                                      "marks": {"kept": 3, "removed": 2, "squashed": 0}}),
                      ("supervisor-settled", 41_000, {"latencyMs": 400, "purpose": "claim",
                                                      "usage": {"inputTokens": 50, "outputTokens": 5}}),
                  ])]
        folded = calls.fold_journal(events)
        own, summary, reading = folded["calls"]
        self.assertEqual((own["purpose"], own["frame"], own["attempt"], own["reask"], own["tries"], own["derived"]),
                         ("frame", 4, 2, "compile_failed", 2, []), "the settle's own keys win over the request's")
        self.assertEqual((own["stages"], own["timing"], own["servedTier"]), (stages, timing, "priority"))
        self.assertEqual((own["thinkingTokens"], own["writtenTokens"]), (100, 290), "the written count is read, not subtracted")
        self.assertEqual((summary["purpose"], summary["settled"], summary["derived"]), ("compaction", True, []))
        self.assertEqual((summary["start"], summary["end"], summary["durationMs"]), (stamp(13_000), stamp(28_000), 15_000))
        self.assertEqual((summary["inputTokens"], summary["outputTokens"], summary["thinkingTokens"], summary["writtenTokens"],
                          summary["stages"], summary["tries"], summary["frame"]), (8_000, 900, 200, 700, {"firstEventMs": 6_000}, 1, 5))
        self.assertEqual(folded["compactions"], [
            {"at": stamp(30_000), "frame": 5, "durationMs": 16_500, "summaryCall": True, "derived": [],
             "causes": ["outdated_context", "budget"], "marks": marks, "context": {"before": 250_000, "after": 60_000},
             "removed": 1_200},
            {"at": stamp(40_000), "frame": 7, "durationMs": 800, "summaryCall": False, "derived": [],
             "causes": ["irrelevant_context"], "marks": {"kept": 3, "removed": 2, "squashed": 0}}],
            "a compaction that squashed nothing made no call and is still a compaction")
        self.assertEqual(folded["byPurpose"]["compaction"]["calls"], 1)
        self.assertEqual(folded["time"]["compactionMs"], 17_000 + 800, "the whole compaction, not its summary call alone")
        self.assertEqual((reading["purpose"], reading["derived"]), ("claim", []), "a written purpose wins over the event's kind")
        self.assertNotIn("marks", [row["purpose"] for row in folded["calls"]],
                         "a compaction's marks reading is its `decision-settled` rows; `marksCall` sums them")
        seat = agent.summarize(events)
        self.assertEqual((seat["modelCalls"], seat["usage"]["inputTokens"], seat["compactions"]),
                         (1, 9_000, folded["compactions"]), "a summary call is not one of the agent's own")
        side = calls.breakdown([{"source": "journal", **folded}])
        self.assertEqual((side["wait"], side["compactions"]),
                         ({"stage": "stages.firstEventMs", "calls": 1, "medianMs": 7_000, "leastMs": 7_000}, 2),
                         "the harness's own reading, of the agent's own calls")
        once = {"calls": 1}
        self.assertEqual(side["stageMedians"], {
            "stages": {"firstEventMs": {**once, "medianMs": 7_000}, "firstThinkingMs": {**once, "medianMs": 7_100},
                       "firstOutputMs": {**once, "medianMs": 9_000}, "lastOutputMs": {**once, "medianMs": 11_500}},
            "timing": {"signedMs": {**once, "medianMs": 3}, "sentMs": {**once, "medianMs": 9},
                       "headersMs": {**once, "medianMs": 6_900}, "firstEventMs": {**once, "medianMs": 6_950},
                       "completedMs": {**once, "medianMs": 11_900}, "closedMs": {**once, "medianMs": 11_950}}},
            "every stage either record names, in the order a call reaches them; counts and sizes are not stages")
        text = calls.render("t", {"source": "journal", **folded})
        self.assertIn("  wait before a reply began: median 7.0 s, least 7.0 s (stages.firstEventMs, 1 calls)\n", text)
        self.assertIn("  median `stages` offsets from a call's start: `firstEventMs` 7.0 s, `firstThinkingMs` 7.1 s, "
                      "`firstOutputMs` 9.0 s, `lastOutputMs` 11.5 s (1 calls)\n", text)
        self.assertIn("  median `timing` offsets from a call's start: `signedMs` 0.0 s, `sentMs` 0.0 s, `headersMs` 6.9 s, "
                      "`firstEventMs` 7.0 s, `completedMs` 11.9 s, `closedMs` 11.9 s (1 calls)\n", text)
        self.assertIn("  compaction before frame 5: outdated_context, budget, 16.5 s, context 250,000 to 60,000 tokens\n", text)
        self.assertIn("  compaction before frame 7: irrelevant_context, 0.8 s\n", text)
        self.assertIn("| 4 try 2 | asked again after compile_failed, 2 tries, first event 7.0 s, first output 9.0 s, "
                      "headers 6.9 s |\n", text)


class SessionFold(unittest.TestCase):
    def setUp(self) -> None:
        self.folded = calls.fold_session(session())

    def test_every_request_is_a_row(self) -> None:
        rows = self.folded["calls"]
        self.assertEqual(
            [(row["start"], row["end"], row["durationMs"]) for row in rows],
            [("2026-01-01T00:00:01.000Z", "2026-01-01T00:00:05.000Z", 4_000),
             ("2026-01-01T00:00:05.500Z", "2026-01-01T00:00:15.500Z", 10_000),
             ("2026-01-01T00:00:17.500Z", "2026-01-01T00:00:21.500Z", 4_000)],
        )
        self.assertEqual([(row["inputTokens"], row["cachedTokens"], row["outputTokens"], row["thinkingTokens"],
                           row["writtenTokens"]) for row in rows],
                         [(12_000, 9_000, 200, 0, 200), (13_000, 12_000, 400, 300, 100), (14_000, 13_000, 300, 100, 200)])
        self.assertEqual({(row["purpose"], row["settled"], row["model"]) for row in rows}, {("frame", True, SEAT)})
        self.assertEqual([row["timing"] for row in rows], [{"firstItemMs": 1_200}, {"firstItemMs": 2_000}, {"firstItemMs": 1_500}])
        self.assertEqual({tuple(row["derived"]) for row in rows}, {("durationMs", "start", "timing", "writtenTokens")})

    def test_the_session_names_its_effort_summary_and_cli_and_no_id(self) -> None:
        self.assertEqual(self.folded["session"], {"cliVersion": "0.160.0", "models": [SEAT], "efforts": ["xhigh"],
                                                  "summaries": ["none"], "compactions": 1})
        text = json.dumps(self.folded)
        self.assertNotIn(ACCOUNT, text)
        self.assertNotIn("resp-do-not-copy", text)

    def test_commands_are_the_time_from_a_reply_to_its_last_tool_output(self) -> None:
        self.assertEqual(self.folded["time"], {"spanMs": 21_500, "modelMs": 18_000, "compactionMs": 0, "commandsMs": 2_500,
                                               "judgeMs": 0, "otherMs": 1_000})
        self.assertEqual(self.folded["byPurpose"]["frame"]["totalTokens"], 39_900)
        self.assertIsNone(self.folded["ledgerTokens"])
        side = calls.breakdown([{"source": "session", **self.folded}])
        self.assertEqual(side["wait"], {"stage": "timing.firstItemMs", "calls": 3, "medianMs": 1_500, "leastMs": 1_200})
        self.assertEqual(side["stageMedians"], {"timing": {"firstItemMs": {"calls": 3, "medianMs": 1_500}}})
        untimed = calls.breakdown([{"source": "journal", **calls.fold_journal(journal())}])
        self.assertEqual((untimed["wait"], untimed["stageMedians"]), (None, None),
                         "a journal that timed no stage has no wait to report")

    def test_a_log_without_usage_records_gives_no_rows(self) -> None:
        folded = calls.fold_session([line for line in session() if "token_usage_record" not in line])
        self.assertEqual((folded["calls"], folded["session"]["cliVersion"]), ([], "0.160.0"))


class Fit(unittest.TestCase):
    @staticmethod
    def rows(count: int, fixed: int = 2_000, thinking_ms: int = 30, written_ms: int = 15) -> list[dict]:
        rows = []
        for index in range(count):
            thinking, written = (index * 137) % 700, 10 + (index * 53) % 440
            rows.append({"purpose": "frame", "settled": True, "thinkingTokens": thinking, "writtenTokens": written,
                         "durationMs": fixed + thinking_ms * thinking + written_ms * written})
        return rows

    def test_the_fit_recovers_known_coefficients(self) -> None:
        fit = calls.fit(self.rows(12))
        self.assertEqual(fit, {"calls": 12, "fixedSeconds": 2.0, "msPerThinkingToken": 30.0, "msPerWrittenToken": 15.0,
                               "r2": 1.0})

    def test_noise_lowers_r_squared_and_leaves_the_coefficients_close(self) -> None:
        rows = self.rows(40)
        for index, row in enumerate(rows):
            row["durationMs"] += (-1) ** index * 400
        fit = calls.fit(rows)
        self.assertAlmostEqual(fit["msPerThinkingToken"], 30.0, delta=1.0)
        self.assertAlmostEqual(fit["msPerWrittenToken"], 15.0, delta=1.0)
        self.assertTrue(0.99 < fit["r2"] < 1.0, fit)

    def test_only_the_agents_own_settled_calls_with_both_counts_are_fitted(self) -> None:
        rows = self.rows(12)
        noise = [{"purpose": "judge", "settled": True, "thinkingTokens": 0, "writtenTokens": 40, "durationMs": 99_000},
                 {"purpose": "frame", "settled": False, "thinkingTokens": None, "writtenTokens": None, "durationMs": 99_000},
                 {"purpose": "frame", "settled": True, "thinkingTokens": None, "writtenTokens": 50, "durationMs": 99_000}]
        self.assertEqual(calls.fit(rows + noise), calls.fit(rows))

    def test_a_degenerate_sample_has_no_fit(self) -> None:
        self.assertIsNone(calls.fit(self.rows(3)), "three calls fit three unknowns exactly")
        collinear = [{**row, "writtenTokens": 2 * row["thinkingTokens"]} for row in self.rows(12)]
        self.assertIsNone(calls.fit(collinear))
        flat = [{**row, "durationMs": 5_000} for row in self.rows(12)]
        self.assertEqual(calls.fit(flat)["r2"], None, "no variance to explain")
        self.assertIsNone(calls.fit([]))


class Weighted(unittest.TestCase):
    def test_weighted_tokens_are_uncached_plus_a_tenth_of_cached_plus_eight_times_output(self) -> None:
        self.assertEqual(calls.weighted(554_716, 487_936, 26_080), 324_213.6)
        self.assertEqual(calls.weighted(100, None, 10), 180, "no cached count reads as none cached")
        self.assertIsNone(calls.weighted(None, 5, 10))


class Trial(unittest.TestCase):
    """What `read_trial` makes of the files a trial directory holds."""

    def setUp(self) -> None:
        self.temp = tempfile.TemporaryDirectory(prefix="calls-fixture-")
        self.addCleanup(self.temp.cleanup)
        self.trial = Path(self.temp.name) / "task__abc"
        (self.trial / "agent").mkdir(parents=True)

    def test_a_trajectory_with_call_rows_is_read_as_written(self) -> None:
        events = journal()
        document = agent.trajectory(events, agent_name="smithers", agent_version="test", seat="s", instruction="i",
                                    session_id="t")
        (self.trial / "agent" / "trajectory.json").write_text(json.dumps(document))
        read = calls.read_trial(self.trial)
        folded = calls.fold_journal(events)
        self.assertEqual((read["source"], read["calls"], read["time"]), ("trajectory", folded["calls"], folded["time"]))
        self.assertEqual((read["ledgerTokens"], read["compactions"]), (71_260, folded["compactions"]))
        self.assertEqual(calls.breakdown([read])["compactions"], 1)

    def test_an_old_trajectory_without_call_rows_still_reports_its_frame_calls(self) -> None:
        old = {"schema_version": "ATIF-v1.8", "steps": [
            {"step_id": 1, "source": "user", "message": "i"},
            {"step_id": 2, "source": "agent", "timestamp": stamp(0), "message": "a",
             "metrics": {"prompt_tokens": 1_000, "completion_tokens": 50, "cached_tokens": 200,
                         "extra": {"reasoning_tokens": None, "duration_millis": 12_000}}},
            {"step_id": 3, "source": "agent", "timestamp": stamp(13_000), "message": "b",
             "metrics": {"prompt_tokens": 2_000, "completion_tokens": 70, "cached_tokens": 900,
                         "extra": {"reasoning_tokens": 20, "duration_millis": 8_000}}},
            {"step_id": 4, "source": "agent", "message": "no reply"},
        ], "final_metrics": {"total_prompt_tokens": 3_000}}
        (self.trial / "agent" / "trajectory.json").write_text(json.dumps(old))
        read = calls.read_trial(self.trial)
        self.assertEqual(read["source"], "steps")
        self.assertEqual([(row["purpose"], row["inputTokens"], row["thinkingTokens"], row["writtenTokens"],
                           row["durationMs"]) for row in read["calls"]],
                         [("frame", 1_000, None, None, 12_000), ("frame", 2_000, 20, 50, 8_000)])
        self.assertEqual(read["time"], {"spanMs": None, "modelMs": 20_000, "compactionMs": None, "commandsMs": None,
                                        "judgeMs": None, "otherMs": None})
        self.assertEqual(read["byPurpose"]["frame"]["totalTokens"], 3_120)
        self.assertIsNone(read["ledgerTokens"])
        self.assertNotIn("unlistedInputTokens", read)
        old["final_metrics"]["total_prompt_tokens"] = 3_900
        (self.trial / "agent" / "trajectory.json").write_text(json.dumps(old))
        (self.trial / "agent" / "smithers-run.json").write_text(json.dumps({"wallSec": 31.5}))
        dropped = calls.read_trial(self.trial)
        self.assertEqual((dropped["unlistedInputTokens"], dropped["wallSec"]), (900, 31.5),
                         "a total above its rows is a call the old fold dropped")
        self.assertIn("holds 900 input tokens that no step lists", calls.render("t", dropped))

    def test_a_session_log_wins_and_a_trial_with_neither_reads_empty(self) -> None:
        empty = calls.read_trial(self.trial)
        self.assertEqual((empty["source"], empty["calls"], empty["time"]), (None, [], None))
        (self.trial / "agent" / "trajectory.json").write_text("{}")
        self.assertEqual(calls.read_trial(self.trial)["source"], None)
        sessions = self.trial / "agent" / "sessions" / "2026" / "01" / "01"
        sessions.mkdir(parents=True)
        (sessions / "rollout-2026-01-01T00-00-00-x.jsonl").write_text("\n".join(session()) + "\n")
        read = calls.read_trial(self.trial)
        self.assertEqual((read["source"], len(read["calls"]), read["session"]["efforts"]), ("session", 3, ["xhigh"]))

    def test_the_cli_prints_the_rows_and_the_summary(self) -> None:
        sessions = self.trial / "agent" / "sessions"
        sessions.mkdir()
        (sessions / "rollout-x.jsonl").write_text("\n".join(session()) + "\n")
        script = str(HERE.parent / "calls.py")
        process = subprocess.run([sys.executable, "-B", script, str(self.trial), "--json"], text=True,
                                 capture_output=True, timeout=60)
        self.assertEqual((process.returncode, process.stderr), (0, ""))
        (document,) = json.loads(process.stdout)
        self.assertEqual((document["trial"], document["summary"]["modelCalls"], document["summary"]["secondsPerCall"]),
                         ("task__abc", 3, 6.0))
        text = subprocess.run([sys.executable, "-B", script, str(self.trial)], text=True, capture_output=True,
                              timeout=60).stdout
        self.assertIn("task__abc: 3 model calls, 6.0 s per call, cache share 87.2%", text)
        self.assertIn("| 2 | frame | 00:00:05.500 | 10.0 | 13,000 | 12,000 | 300 | 100 |", text)
        usage_text = subprocess.run([sys.executable, "-B", script], text=True, capture_output=True, timeout=60)
        self.assertEqual(usage_text.returncode, 64)


if __name__ == "__main__":
    result = unittest.main(exit=False, verbosity=0).result
    if not result.wasSuccessful():
        sys.exit(1)
    print(f"check_calls.py: {result.testsRun} per-call record checks hold.")
