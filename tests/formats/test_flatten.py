"""Unit tests for nested struct flattening helpers."""

import pytest
from formats.flatten import generate_flattening_expressions, parse_struct_fields


def test_parse_struct_fields_simple():
    type_str = "STRUCT(city VARCHAR, zip VARCHAR)"
    fields = parse_struct_fields(type_str)
    assert fields == [("city", "VARCHAR"), ("zip", "VARCHAR")]


def test_parse_struct_fields_nested():
    type_str = "STRUCT(name VARCHAR, address STRUCT(street VARCHAR, num BIGINT))"
    fields = parse_struct_fields(type_str)
    assert len(fields) == 2
    assert fields[0] == ("name", "VARCHAR")
    assert fields[1] == ("address", "STRUCT(street VARCHAR, num BIGINT)")


def test_generate_flattening_expressions():
    cols_with_types = [
        ("id", "BIGINT"),
        ("user", "STRUCT(name VARCHAR, address STRUCT(city VARCHAR, zip VARCHAR))"),
        ("status", "VARCHAR"),
    ]
    exprs, flattened, warnings = generate_flattening_expressions(cols_with_types)
    assert flattened is True
    assert len(exprs) == 5
    assert 'struct_extract(struct_extract("user", \'address\'), \'city\') AS "user.address.city"' in exprs
    assert 'struct_extract(struct_extract("user", \'address\'), \'zip\') AS "user.address.zip"' in exprs
    assert 'struct_extract("user", \'name\') AS "user.name"' in exprs


def test_generate_flattening_collision_resolution():
    cols_with_types = [
        ("user.name", "VARCHAR"),
        ("user", "STRUCT(name VARCHAR)"),
    ]
    exprs, flattened, warnings = generate_flattening_expressions(cols_with_types)
    assert flattened is True
    assert len(warnings) == 1
    assert "user.name_2" in exprs[1]
