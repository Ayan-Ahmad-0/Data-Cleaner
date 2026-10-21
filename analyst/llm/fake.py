"""Deterministic Fake LLM client for tests and evaluation."""

from __future__ import annotations
from typing import Any, Callable, Dict, List, Optional, Type, TypeVar, Union
from pydantic import BaseModel

from analyst.errors import LLMBadResponseError, LLMTimeoutError, LLMUnavailableError
from analyst.llm.base import LLMClient

T = TypeVar("T", bound=BaseModel)


class FakeLLMClient(LLMClient):
    """Test fake for simulating structured LLM responses without external network calls."""

    def __init__(
        self,
        canned_responses: Optional[Union[List[Any], Dict[str, Any], Callable[..., Any]]] = None,
    ) -> None:
        self.canned_responses = canned_responses
        self.calls: List[Dict[str, Any]] = []

    def generate_structured(
        self,
        system_prompt: str,
        user_prompt: str,
        response_model: Type[T],
    ) -> T:
        call_record = {
            "system_prompt": system_prompt,
            "user_prompt": user_prompt,
            "response_model": response_model,
        }
        self.calls.append(call_record)

        # 0. Direct Exception instance
        if isinstance(self.canned_responses, Exception):
            raise self.canned_responses

        # 1. Callable handler
        if callable(self.canned_responses):
            res = self.canned_responses(system_prompt, user_prompt, response_model)
            if isinstance(res, Exception):
                raise res
            if isinstance(res, response_model):
                return res
            if isinstance(res, dict):
                return response_model.model_validate(res)
            if isinstance(res, str):
                return response_model.model_validate_json(res)
            raise LLMBadResponseError(f"Unexpected callable result: {res}")

        # 2. List of responses (consumed sequentially)
        if isinstance(self.canned_responses, list):
            if not self.canned_responses:
                raise LLMBadResponseError("FakeLLMClient ran out of canned responses.")
            item = self.canned_responses.pop(0)
            if isinstance(item, Exception):
                raise item
            if isinstance(item, response_model):
                return item
            if isinstance(item, dict):
                return response_model.model_validate(item)
            if isinstance(item, str):
                return response_model.model_validate_json(item)
            return item

        # 3. Dict of responses keyed by matching query/prompt substring
        if isinstance(self.canned_responses, dict):
            for pattern, item in self.canned_responses.items():
                if pattern in user_prompt:
                    if isinstance(item, Exception):
                        raise item
                    if isinstance(item, response_model):
                        return item
                    if isinstance(item, dict):
                        return response_model.model_validate(item)
                    if isinstance(item, str):
                        return response_model.model_validate_json(item)
                    return item

            # Check if default key exists
            if "__default__" in self.canned_responses:
                item = self.canned_responses["__default__"]
                if isinstance(item, Exception):
                    raise item
                if isinstance(item, response_model):
                    return item
                if isinstance(item, dict):
                    return response_model.model_validate(item)
                return item

            raise LLMBadResponseError(f"No matching canned response found for prompt in fake dictionary.")

        raise LLMBadResponseError("No canned responses configured in FakeLLMClient.")
