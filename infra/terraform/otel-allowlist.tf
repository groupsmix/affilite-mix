# OF-35: validate OTEL endpoint is HTTPS + on allow-listed host before apply.
locals {
  otel_endpoint_valid = (
    can(regex("^https://", var.otel_endpoint))
    && contains(var.otel_endpoint_allowlist, regex("^https://([^/]+)", var.otel_endpoint))
  )
}

resource "null_resource" "otel_endpoint_guard" {
  lifecycle {
    precondition {
      condition     = local.otel_endpoint_valid
      error_message = "OTEL_ENDPOINT must be HTTPS and present in otel_endpoint_allowlist."
    }
  }
}
