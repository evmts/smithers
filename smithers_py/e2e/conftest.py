"""Shared fixtures for E2E tests."""

import pytest
import pytest_asyncio

from .harness import ExecutionHarness, TestModel


@pytest_asyncio.fixture
async def harness():
    """Provide an initialized ExecutionHarness."""
    h = ExecutionHarness()
    await h.setup()
    yield h
    await h.teardown()


@pytest.fixture
def test_model():
    """Provide a fresh TestModel instance."""
    return TestModel()


@pytest.fixture
def slow_model():
    """Provide a TestModel with slower responses."""
    return TestModel(delay=0.1)


@pytest.fixture
def failing_model():
    """Provide a TestModel that fails on specific nodes."""
    return TestModel(fail_on={"failing_node"})
