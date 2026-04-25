export async function createProduct(data: any) {
  if (data.affiliate_url && !data.affiliate_url.match(/^https:\/\//i)) {
    throw new Error("Affiliate URL must use https:// scheme");
  }
  // Insert logic
}
