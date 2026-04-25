resource "cloudflare_logpush_job" "cloudflare_logs" {
  name      = "http_logs_to_s3"
  enabled   = true
  dataset   = "http_requests"
  logpull_options = "fields=ClientIP,ClientRequestHost,ClientRequestMethod,ClientRequestURI,EdgeEndTimestamp,EdgeResponseBytes,EdgeResponseStatus,RayID,WAFAction,WAFRuleID,WAFRuleMessage"
  destination_conf = "s3://cloudflare-logs?region=auto"
}
