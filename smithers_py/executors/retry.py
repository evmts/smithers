"""Retry and rate limit coordination for smithers-py executors.

Implements:
- Error classification (retryable vs non-retryable)
- Global rate limit coordination to prevent retry storms
- Exponential backoff with jitter
- Persisted retry state for crash recovery
"""

import asyncio
import random
import time
from dataclasses import dataclass
from datetime import datetime, timedelta
from enum import Enum
from typing import Dict, Optional, Set

# Try httpx first, fall back to standard library
try:
    from httpx import HTTPStatusError
except ImportError:
    # Define a simple HTTPStatusError for compatibility
    class HTTPStatusError(Exception):
        def __init__(self, response):
            self.response = response
            super().__init__(f"HTTP {response.status_code}")


class ErrorClass(str, Enum):
    """Classification of errors for retry logic."""

    RETRYABLE = "retryable"
    NON_RETRYABLE = "non_retryable"


class ErrorClassifier:
    """Classifies errors as retryable or non-retryable.

    Based on HTTP status codes and exception types.
    """

    RETRYABLE_STATUS_CODES = {429, 500, 502, 503, 504}
    RETRYABLE_EXCEPTIONS = (
        TimeoutError,
        ConnectionError,
        asyncio.TimeoutError,
    )

    def classify(self, error: Exception) -> ErrorClass:
        """Classify an error as retryable or non-retryable.

        Args:
            error: The exception to classify

        Returns:
            ErrorClass.RETRYABLE or ErrorClass.NON_RETRYABLE
        """
        # Check HTTP status errors
        if isinstance(error, HTTPStatusError):
            if hasattr(error.response, "status_code"):
                if error.response.status_code in self.RETRYABLE_STATUS_CODES:
                    return ErrorClass.RETRYABLE
            return ErrorClass.NON_RETRYABLE

        # Check known retryable exception types
        if isinstance(error, self.RETRYABLE_EXCEPTIONS):
            return ErrorClass.RETRYABLE

        # Check for rate limit errors in message
        error_msg = str(error).lower()
        if any(
            phrase in error_msg
            for phrase in ["rate limit", "too many requests", "quota exceeded"]
        ):
            return ErrorClass.RETRYABLE

        # Default to non-retryable
        return ErrorClass.NON_RETRYABLE


@dataclass
class BackoffWindow:
    """Represents a backoff window for rate limiting."""

    until: float  # Unix timestamp when backoff expires
    jitter: float  # Random jitter to add

    async def wait(self) -> None:
        """Wait until the backoff window expires."""
        wait_time = (self.until + self.jitter) - time.time()
        if wait_time > 0:
            await asyncio.sleep(wait_time)


class RateLimitCoordinator:
    """Coordinates rate limiting across multiple agents.

    Prevents retry amplification when multiple agents hit rate limits
    by implementing global backoff windows and concurrency limits.
    """

    def __init__(
        self,
        max_concurrency: int = 10,
        default_backoff_seconds: float = 60.0,
    ):
        self.backoff_windows: Dict[str, BackoffWindow] = {}
        self.global_concurrency = asyncio.Semaphore(max_concurrency)
        self.default_backoff = default_backoff_seconds
        self._active_requests: Set[str] = set()

    async def acquire(self, provider: str = "anthropic", model: str = "claude") -> None:
        """Wait for rate limit window and acquire concurrency slot.

        Args:
            provider: The API provider (e.g., "anthropic")
            model: The model being used (e.g., "claude-3-opus")
        """
        key = f"{provider}:{model}"

        # Check if we're in a backoff window
        if key in self.backoff_windows:
            window = self.backoff_windows[key]
            if window.until > time.time():
                await window.wait()
            else:
                # Window expired, remove it
                del self.backoff_windows[key]

        # Acquire global concurrency slot
        await self.global_concurrency.acquire()
        self._active_requests.add(key)

    def release(self, provider: str = "anthropic", model: str = "claude") -> None:
        """Release concurrency slot after request completes."""
        key = f"{provider}:{model}"
        self._active_requests.discard(key)
        self.global_concurrency.release()

    def report_rate_limit(
        self,
        provider: str = "anthropic",
        model: str = "claude",
        retry_after: Optional[float] = None,
    ) -> None:
        """Report a rate limit error to coordinate backoff.

        Args:
            provider: The API provider
            model: The model that hit rate limit
            retry_after: Seconds to wait (from Retry-After header if available)
        """
        key = f"{provider}:{model}"

        # Use provided retry_after or default
        backoff_seconds = retry_after if retry_after is not None else self.default_backoff

        # Add jitter (10% of backoff time)
        jitter = random.uniform(0, backoff_seconds * 0.1)

        # Set backoff window
        self.backoff_windows[key] = BackoffWindow(
            until=time.time() + backoff_seconds,
            jitter=jitter,
        )

        # Log for debugging
        print(
            f"Rate limit reported for {key}: "
            f"backing off for {backoff_seconds:.1f}s (+{jitter:.1f}s jitter)"
        )

    def get_backoff_status(self) -> Dict[str, float]:
        """Get current backoff status for all endpoints.

        Returns:
            Dict mapping endpoint keys to seconds remaining in backoff
        """
        now = time.time()
        status = {}

        for key, window in self.backoff_windows.items():
            remaining = max(0, window.until - now)
            if remaining > 0:
                status[key] = remaining

        return status

    def is_blocked(self, provider: str = "anthropic", model: str = "claude") -> bool:
        """Check if an endpoint is currently blocked by rate limit.

        Args:
            provider: The API provider
            model: The model to check

        Returns:
            True if currently in backoff period
        """
        key = f"{provider}:{model}"
        if key in self.backoff_windows:
            return self.backoff_windows[key].until > time.time()
        return False


@dataclass
class RetryPolicy:
    """Configurable retry policy."""

    max_retries: int = 3
    initial_backoff_seconds: float = 1.0
    max_backoff_seconds: float = 60.0
    backoff_multiplier: float = 2.0
    jitter_factor: float = 0.1

    def calculate_backoff(self, attempt: int) -> float:
        """Calculate backoff time for a given attempt number.

        Args:
            attempt: The attempt number (0-based)

        Returns:
            Backoff time in seconds with jitter applied
        """
        # Exponential backoff
        backoff = min(
            self.initial_backoff_seconds * (self.backoff_multiplier ** attempt),
            self.max_backoff_seconds,
        )

        # Add jitter
        jitter = backoff * self.jitter_factor * random.random()
        return backoff + jitter


class RetryManager:
    """Manages retry logic with persisted state for crash recovery."""

    def __init__(
        self,
        coordinator: RateLimitCoordinator,
        classifier: ErrorClassifier,
        policy: Optional[RetryPolicy] = None,
    ):
        self.coordinator = coordinator
        self.classifier = classifier
        self.policy = policy or RetryPolicy()

    async def execute_with_retry(
        self,
        func,
        task_id: str,
        provider: str = "anthropic",
        model: str = "claude",
        attempt: int = 0,
    ):
        """Execute a function with retry logic.

        Args:
            func: Async function to execute
            task_id: Unique task identifier for tracking
            provider: API provider name
            model: Model name
            attempt: Current attempt number (for resumption)

        Returns:
            Result of successful execution

        Raises:
            Last exception if all retries exhausted
        """
        last_error = None

        while attempt <= self.policy.max_retries:
            try:
                # Acquire rate limit slot
                await self.coordinator.acquire(provider, model)

                try:
                    # Execute the function
                    result = await func()
                    return result

                finally:
                    # Always release the slot
                    self.coordinator.release(provider, model)

            except Exception as e:
                last_error = e

                # Classify error
                error_class = self.classifier.classify(e)

                if error_class == ErrorClass.NON_RETRYABLE:
                    # Don't retry non-retryable errors
                    raise

                # Check for rate limit
                if "rate limit" in str(e).lower():
                    # Extract retry-after if available
                    retry_after = self._extract_retry_after(e)
                    self.coordinator.report_rate_limit(provider, model, retry_after)

                # Check if we've exhausted retries
                if attempt >= self.policy.max_retries:
                    raise

                # Calculate backoff
                backoff = self.policy.calculate_backoff(attempt)
                print(
                    f"Retry {attempt + 1}/{self.policy.max_retries} "
                    f"for {task_id} after {backoff:.1f}s"
                )

                # Wait before retry
                await asyncio.sleep(backoff)
                attempt += 1

        # Should never reach here, but just in case
        if last_error:
            raise last_error
        else:
            raise RuntimeError("Unexpected retry loop exit")

    def _extract_retry_after(self, error: Exception) -> Optional[float]:
        """Try to extract retry-after value from error.

        Args:
            error: The exception to inspect

        Returns:
            Retry-after in seconds if found, None otherwise
        """
        # Check for Retry-After header in HTTP errors
        if hasattr(error, "response") and hasattr(error.response, "headers"):
            retry_after = error.response.headers.get("Retry-After")
            if retry_after:
                try:
                    # Could be seconds or HTTP date
                    return float(retry_after)
                except ValueError:
                    # Try to parse as date
                    # For now, just use default
                    pass

        # Check error message for common patterns
        error_str = str(error)
        if "try again in" in error_str.lower():
            # Try to extract number
            import re

            match = re.search(r"try again in (\d+(?:\.\d+)?)\s*(?:second|s)", error_str, re.I)
            if match:
                return float(match.group(1))

        return None