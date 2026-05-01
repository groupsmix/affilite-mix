# Logpush field set (OF-31)

Required fields for production HTTP requests dataset:

`ClientIP, ClientRequestHost, ClientRequestMethod, ClientRequestPath,
ClientRequestUserAgent, ClientCountry, EdgeResponseStatus, EdgeStartTimestamp,
RayID, WorkerCPUTime, WorkerStatus, RequestHeaders, ResponseHeaders, RouteID`.

Validate after each Logpush/Tail Worker change with
`scripts/observability/verify-logpush-fields.ts`.
