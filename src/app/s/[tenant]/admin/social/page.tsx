import type { Metadata } from "next";
import SocialComposer from "@/components/admin/SocialComposer";
import { requireChurchAccess } from "@/lib/admin/guard";
import { connectedAccounts, recentPosts } from "@/lib/social/service";
import { isMetaConfigured } from "@/lib/social/meta";
import { env } from "@/lib/env";

export const metadata: Metadata = { title: "Social" };

/**
 * Writing one post and putting it on the church's pages.
 *
 * The composer and the history are on one page on purpose: the question after
 * pressing post is always "did that go out", and the answer should be directly
 * underneath rather than on Facebook.
 */
export default async function SocialPage({ params }: PageProps<"/s/[tenant]/admin/social">) {
  const { tenant } = await params;
  const { church, role } = await requireChurchAccess(tenant);

  const [accounts, posts, configured] = await Promise.all([
    connectedAccounts(church.id),
    recentPosts(church.id),
    isMetaConfigured(),
  ]);

  return (
    <SocialComposer
      tenant={tenant}
      churchName={church.name}
      accounts={accounts}
      configured={configured}
      canConnect={role === "owner"}
      uploadsEnabled={env.storage.isConfigured}
      posts={posts.map((post) => ({
        id: post.id,
        platform: post.platform,
        accountName: post.accountName,
        message: post.message,
        status: post.status,
        error: post.error,
        at: post.createdAt.toISOString(),
      }))}
    />
  );
}
