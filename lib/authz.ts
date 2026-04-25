export async function authorizeResource(options: {
  user: any;
  action: string;
  resourceType: string;
  resourceId: string;
}) {
  const { user, action, resourceType, resourceId } = options;

  // The guard must fetch the resource, derive its real site_id, then check membership
  const resource = await getResourceFromDB(resourceType, resourceId);
  if (!resource) {
    throw new Error("Resource not found");
  }

  const isMember = await checkSiteMembership(user.id, resource.site_id);
  if (!isMember) {
    throw new Error("Unauthorized: Cross-tenant access denied");
  }

  return true;
}

async function getResourceFromDB(type: string, id: string) {
  // mock DB fetch
  return { id, site_id: "site-derived" };
}

async function checkSiteMembership(userId: string, siteId: string) {
  // mock check
  return userId === "user-1" && siteId === "site-derived";
}
