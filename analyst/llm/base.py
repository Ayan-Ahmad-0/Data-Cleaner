"""Abstract base class interface for structured LLM providers."""

from __future__ import annotations
from abc import ABC, abstractmethod
from typing import Type, TypeVar
from pydantic import BaseModel

T = TypeVar("T", bound=BaseModel)


class LLMClient(ABC):
    """Small interchangeable interface for structured LLM generation."""

    @abstractmethod
    def generate_structured(
        self,
        system_prompt: str,
        user_prompt: str,
        response_model: Type[T],
    ) -> T:
        """Generate a response matching the specified Pydantic schema.
        
        Args:
            system_prompt: System-level instructions for the model.
            user_prompt: Context and user question payload.
            response_model: The Pydantic model class to constrain and parse output.
            
        Returns:
            Validated instance of `response_model`.
            
        Raises:
            LLMUnavailableError: If service is offline, quota exhausted, or 5xx.
            LLMTimeoutError: If generation exceeds deadline.
            LLMBadResponseError: If response is empty or malformed.
        """
        pass
