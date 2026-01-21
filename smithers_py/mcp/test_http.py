"""Tests for HTTP Transport.

Tests the HttpTransport security validation and request handling.
"""

import pytest
import json
from dataclasses import dataclass
from typing import Dict

from smithers_py.mcp.http import (
    HttpTransport,
    HttpTransportSecurity,
    HttpRequest,
    HttpResponse,
    SecurityError,
    AuthError,
)


@pytest.fixture
def security():
    """Create security instance with known token."""
    return HttpTransportSecurity(auth_token="test-token-123")


class TestHttpTransportSecurity:
    """Tests for HttpTransportSecurity class."""
    
    def test_valid_request(self, security):
        """Test valid request passes validation."""
        request = HttpRequest(
            method="POST",
            path="/mcp",
            headers={
                "origin": "http://localhost:8080",
                "authorization": "Bearer test-token-123"
            },
            body=b"{}",
            query_params={}
        )
        
        # Should not raise
        security.validate_request(request)
    
    def test_valid_request_127(self, security):
        """Test 127.0.0.1 origin is allowed."""
        request = HttpRequest(
            method="POST",
            path="/mcp",
            headers={
                "origin": "http://127.0.0.1:3000",
                "authorization": "Bearer test-token-123"
            },
            body=b"{}",
            query_params={}
        )
        
        security.validate_request(request)
    
    def test_null_origin_allowed(self, security):
        """Test null origin (file:// or Electron) is allowed."""
        request = HttpRequest(
            method="POST",
            path="/mcp",
            headers={
                "origin": "null",
                "authorization": "Bearer test-token-123"
            },
            body=b"{}",
            query_params={}
        )
        
        security.validate_request(request)
    
    def test_no_origin_allowed(self, security):
        """Test request without origin is allowed (same-origin)."""
        request = HttpRequest(
            method="POST",
            path="/mcp",
            headers={
                "authorization": "Bearer test-token-123"
            },
            body=b"{}",
            query_params={}
        )
        
        security.validate_request(request)
    
    def test_invalid_origin_rejected(self, security):
        """Test external origin is rejected."""
        request = HttpRequest(
            method="POST",
            path="/mcp",
            headers={
                "origin": "https://evil.com",
                "authorization": "Bearer test-token-123"
            },
            body=b"{}",
            query_params={}
        )
        
        with pytest.raises(SecurityError) as exc:
            security.validate_request(request)
        
        assert "evil.com" in str(exc.value)
    
    def test_missing_auth_rejected(self, security):
        """Test missing auth token is rejected."""
        request = HttpRequest(
            method="POST",
            path="/mcp",
            headers={
                "origin": "http://localhost:8080"
            },
            body=b"{}",
            query_params={}
        )
        
        with pytest.raises(AuthError):
            security.validate_request(request)
    
    def test_wrong_auth_rejected(self, security):
        """Test wrong auth token is rejected."""
        request = HttpRequest(
            method="POST",
            path="/mcp",
            headers={
                "origin": "http://localhost:8080",
                "authorization": "Bearer wrong-token"
            },
            body=b"{}",
            query_params={}
        )
        
        with pytest.raises(AuthError):
            security.validate_request(request)
    
    def test_bearer_case_sensitive(self, security):
        """Test Bearer prefix is case-sensitive."""
        request = HttpRequest(
            method="POST",
            path="/mcp",
            headers={
                "authorization": "bearer test-token-123"  # lowercase bearer
            },
            body=b"{}",
            query_params={}
        )
        
        with pytest.raises(AuthError):
            security.validate_request(request)


class TestHttpResponse:
    """Tests for HttpResponse class."""
    
    def test_json_response(self):
        """Test JSON response creation."""
        data = {"key": "value", "number": 42}
        response = HttpResponse.json(data)
        
        assert response.status == 200
        assert response.headers["Content-Type"] == "application/json"
        assert json.loads(response.body.decode()) == data
    
    def test_json_response_custom_status(self):
        """Test JSON response with custom status."""
        response = HttpResponse.json({"created": True}, status=201)
        
        assert response.status == 201
    
    def test_error_response(self):
        """Test error response creation."""
        response = HttpResponse.error("Not found", status=404)
        
        assert response.status == 404
        body = json.loads(response.body.decode())
        assert body["error"] == "Not found"


class TestHttpRequest:
    """Tests for HttpRequest dataclass."""
    
    def test_request_creation(self):
        """Test request dataclass."""
        request = HttpRequest(
            method="GET",
            path="/mcp",
            headers={"accept": "text/event-stream"},
            body=b"",
            query_params={"page": "1"}
        )
        
        assert request.method == "GET"
        assert request.path == "/mcp"
        assert request.headers["accept"] == "text/event-stream"
        assert request.query_params["page"] == "1"
