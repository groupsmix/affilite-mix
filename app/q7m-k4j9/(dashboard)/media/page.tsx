import { requireAdminSessionWithSite } from "../components/admin-guard";
import { AdminDataError, safeAdminData } from "../components/admin-page-state";
import { resolveDbSiteId } from "@/lib/dal/site-resolver";
import { listMedia } from "@/lib/dal/media";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { MediaLibrary } from "./components/media-library";
import { MediaUpload } from "./components/media-upload";

export default async function MediaPage() {
  const session = await requireAdminSessionWithSite();

  const siteIdResult = await safeAdminData(
    "media active site resolution",
    () => resolveDbSiteId(session.activeSiteSlug),
    "",
  );
  if (siteIdResult.error || !siteIdResult.data) {
    return (
      <AdminDataError
        title="Media could not load"
        description="The active site could not be resolved in the database. Re-select the site or run the site provisioning migration."
        retryHref="/q7m-k4j9/media"
      />
    );
  }
  const dbSiteId = siteIdResult.data;

  const mediaResult = await safeAdminData("media list", () => listMedia({ siteId: dbSiteId }), []);
  if (mediaResult.error) {
    return (
      <AdminDataError
        title="Media could not load"
        description="There was a problem loading the media library."
        retryHref="/q7m-k4j9/media"
      />
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Media Library</h1>
        <p className="text-muted-foreground">
          Upload, manage, and reuse images across products, content, and settings.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Upload</CardTitle>
          <CardDescription>
            Drop an image to add it to the library. It will be validated and stored in the public
            bucket.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <MediaUpload />
        </CardContent>
      </Card>

      <MediaLibrary media={mediaResult.data} />
    </div>
  );
}
