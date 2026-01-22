"""Smithers decorators for user-defined components."""

from functools import wraps
from typing import Callable, Any


def component(func: Callable[..., Any]) -> Callable[..., Any]:
    """
    Mark a function as a Smithers component.
    
    Components are user-defined functions that return node trees.
    They receive a Context and optional props, returning Node instances.
    
    Usage:
        @component
        def MyApp(ctx, **props):
            return jsx("phase", {"name": "main"}, 
                jsx("claude", {"prompt": "Hello"})
            )
    """
    @wraps(func)
    def wrapper(*args, **kwargs):
        return func(*args, **kwargs)
    
    wrapper._smithers_component = True
    wrapper._component_name = func.__name__
    return wrapper


__all__ = ["component"]
