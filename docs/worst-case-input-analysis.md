# Worst-Case Input Analysis (OF-17)

Goal: enumerate public endpoints + the pathological input shapes their
handlers must survive without OOM/CPU starvation.

| Endpoint                  | Inputs    | Worst case                         | Test                                      |
| ------------------------- | --------- | ---------------------------------- | ----------------------------------------- |
| POST /api/quiz/submit     | JSON body | 64KB body, 1k keys, 32 levels deep | `tests/worst-case/quiz-deep.spec.ts`      |
| POST /api/comments        | text body | 10MB HTML, 100k tags, RTL/zalgo    | `tests/worst-case/html-bomb.spec.ts`      |
| GET /api/products/related | id list   | fan-out 1000 ids, graph depth 5    | `tests/worst-case/related-fanout.spec.ts` |
| GET /api/search           | query     | 8k chars + unicode + regex meta    | `tests/worst-case/search-payload.spec.ts` |
| POST /api/wrist-shots     | multipart | 25MB image, 200 fields             | `tests/worst-case/upload-large.spec.ts`   |

Each test asserts:

- p99 latency < 2s
- memory delta < 64MB
- response size < 1MB
- no DB query > 250ms
