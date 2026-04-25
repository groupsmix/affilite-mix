export async function getAICompletion(prompt: string) {
  const ac1 = new AbortController();
  const ac2 = new AbortController();

  const p1 = provider1(prompt, ac1.signal).then(res => {
    ac2.abort();
    return res;
  });

  const p2 = provider2(prompt, ac2.signal).then(res => {
    ac1.abort();
    return res;
  });

  try {
    return await Promise.any([p1, p2]);
  } catch (errors) {
    return await provider3(prompt); // fallback to next
  }
}

async function provider1(prompt: string, signal: AbortSignal) { throw new Error(); }
async function provider2(prompt: string, signal: AbortSignal) { throw new Error(); }
async function provider3(prompt: string) { return "completion"; }
