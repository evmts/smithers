"""Shared fixtures for E2E tests."""

import pytest
import pytest_asyncio

from .harness import ExecutionHarness, MockExecutor


@pytest_asyncio.fixture
async def harness():
    """Provide an initialized ExecutionHarness."""
    h = ExecutionHarness()
    await h.setup()
    yield h
    await h.teardown()


@pytest.fixture
def mock_executor():
    """Provide a fresh MockExecutor instance."""
    return MockExecutor()


@pytest.fixture
def slow_executor():
    """Provide a MockExecutor with slower responses."""
    return MockExecutor(delay=0.1)


@pytest.fixture
def failing_executor():
    """Provide a MockExecutor that fails on specific nodes."""
    return MockExecutor(fail_on={"failing_node"})
