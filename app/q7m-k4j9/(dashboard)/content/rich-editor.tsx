"use client";

import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Link from "@tiptap/extension-link";
import Image from "@tiptap/extension-image";
import Underline from "@tiptap/extension-underline";
import Youtube from "@tiptap/extension-youtube";
import { useEffect, useState, useRef } from "react";
import { isSafeUrl, sanitizeHtml } from "@/lib/sanitize-html";
import { fetchWithCsrf } from "@/lib/fetch-csrf";
import { toast } from "sonner";
import type { ProductRow } from "@/types/database";

/**
 * Only http(s) URLs are permitted inside the editor for images and videos.
 * `isSafeUrl` additionally covers relative / mailto / tel for link anchors,
 * but for `<img>`/embeds we want the stricter http(s)-only rule so data:,
 * blob:, javascript: etc. cannot be inserted even accidentally.
 */
function isHttpUrl(value: string): boolean {
  if (!isSafeUrl(value)) return false;
  const trimmed = value.trim().toLowerCase();
  return trimmed.startsWith("http://") || trimmed.startsWith("https://");
}

interface RichEditorProps {
  value: string;
  onChange: (html: string) => void;
  products?: ProductRow[];
}

type RewriteAction = "expand" | "rewrite" | "rephrase" | "summarize";

const REWRITE_ACTIONS: { value: RewriteAction; label: string }[] = [
  { value: "expand", label: "Expand" },
  { value: "rewrite", label: "Rewrite" },
  { value: "rephrase", label: "Rephrase" },
  { value: "summarize", label: "Summarize" },
];

/** Inline popover for entering a URL (used for both links and images). */
function UrlPopover({
  label,
  placeholder,
  onSubmit,
  onCancel,
}: {
  label: string;
  placeholder: string;
  onSubmit: (url: string) => void;
  onCancel: () => void;
}) {
  const [url, setUrl] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  return (
    <div className="absolute left-0 top-full z-50 mt-1 flex items-center gap-2 rounded-lg border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-2 shadow-lg">
      <label className="text-xs font-medium text-gray-500 dark:text-gray-400">{label}</label>
      <input
        ref={inputRef}
        type="url"
        value={url}
        onChange={(e) => setUrl(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && url) {
            e.preventDefault();
            onSubmit(url);
          }
          if (e.key === "Escape") onCancel();
        }}
        placeholder={placeholder}
        className="w-56 rounded border border-gray-300 dark:border-gray-700 px-2 py-1 text-xs focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
      />
      <button
        type="button"
        onClick={() => {
          if (url) onSubmit(url);
        }}
        className="rounded bg-gray-800 px-2 py-1 text-xs font-medium text-white dark:text-gray-900 hover:bg-gray-700"
      >
        Add
      </button>
      <button
        type="button"
        onClick={onCancel}
        className="rounded px-2 py-1 text-xs font-medium text-gray-500 dark:text-gray-400 hover:bg-gray-100"
      >
        Cancel
      </button>
    </div>
  );
}

function AiPopover({
  editor,
  open,
  onClose,
}: {
  editor: Exclude<ReturnType<typeof useEditor>, null>;
  open: boolean;
  onClose: () => void;
}) {
  const [loading, setLoading] = useState(false);

  if (!open) return null;

  const { from, to } = editor.state.selection;
  const selected = editor.state.doc.textBetween(from, to, " ");
  const empty = from === to;

  async function handleAction(action: RewriteAction) {
    if (empty) {
      toast.error("Select some text first");
      return;
    }
    setLoading(true);
    try {
      const res = await fetchWithCsrf("/api/admin/ai/rewrite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: selected, action }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        toast.error(data.error ?? "AI rewrite failed");
        return;
      }
      const data = (await res.json()) as { text?: string };
      if (!data.text) {
        toast.error("AI returned empty text");
        return;
      }
      editor.chain().focus().deleteRange({ from, to }).insertContentAt(from, data.text).run();
      onClose();
    } catch {
      toast.error("AI rewrite failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="absolute left-0 top-full z-50 mt-1 flex w-56 flex-col gap-2 rounded-lg border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-2 shadow-lg">
      <p className="text-xs font-medium text-gray-500 dark:text-gray-400">
        {empty
          ? "Select text in the editor"
          : `Selected: ${selected.slice(0, 40)}${selected.length > 40 ? "…" : ""}`}
      </p>
      <div className="grid grid-cols-2 gap-2">
        {REWRITE_ACTIONS.map(({ value, label }) => (
          <button
            key={value}
            type="button"
            disabled={loading || empty}
            onClick={() => void handleAction(value)}
            className="rounded bg-emerald-600 px-2 py-1 text-xs font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
          >
            {loading ? "…" : label}
          </button>
        ))}
      </div>
      <button
        type="button"
        onClick={onClose}
        className="rounded px-2 py-1 text-xs font-medium text-gray-500 dark:text-gray-400 hover:bg-gray-100"
      >
        Cancel
      </button>
    </div>
  );
}

function AffiliatePopover({
  editor,
  products,
  open,
  onClose,
}: {
  editor: Exclude<ReturnType<typeof useEditor>, null>;
  products: ProductRow[];
  open: boolean;
  onClose: () => void;
}) {
  const [query, setQuery] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  if (!open) return null;

  const activeProducts = products
    .filter((p) => p.status !== "archived" && p.affiliate_url)
    .filter((p) => p.name.toLowerCase().includes(query.toLowerCase()))
    .slice(0, 20);

  function insertLink(product: ProductRow) {
    const { from, to } = editor.state.selection;
    const hasSelection = from !== to;
    const chain = editor.chain().focus();
    if (hasSelection) {
      chain.setLink({ href: product.affiliate_url }).run();
    } else {
      chain
        .insertContent(
          `<a href="${product.affiliate_url}" target="_blank" rel="noopener noreferrer nofollow">${product.name}</a>`,
        )
        .run();
    }
    onClose();
    setQuery("");
  }

  return (
    <div className="absolute left-0 top-full z-50 mt-1 flex w-72 flex-col gap-2 rounded-lg border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-2 shadow-lg">
      <input
        ref={inputRef}
        type="text"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Escape") onClose();
        }}
        placeholder="Search products…"
        className="w-full rounded border border-gray-300 dark:border-gray-700 px-2 py-1 text-xs focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
      />
      <div className="max-h-48 overflow-y-auto">
        {activeProducts.length === 0 ? (
          <p className="px-2 py-1 text-xs text-gray-500">No products found.</p>
        ) : (
          activeProducts.map((product) => (
            <button
              key={product.id}
              type="button"
              onClick={() => insertLink(product)}
              className="w-full rounded px-2 py-1 text-left text-xs text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800"
            >
              {product.name}
            </button>
          ))
        )}
      </div>
      <button
        type="button"
        onClick={onClose}
        className="rounded px-2 py-1 text-xs font-medium text-gray-500 dark:text-gray-400 hover:bg-gray-100"
      >
        Cancel
      </button>
    </div>
  );
}

function MenuBar({
  editor,
  products,
}: {
  editor: ReturnType<typeof useEditor>;
  products?: ProductRow[];
}) {
  const [showLinkPopover, setShowLinkPopover] = useState(false);
  const [showImagePopover, setShowImagePopover] = useState(false);
  const [showVideoPopover, setShowVideoPopover] = useState(false);
  const [showAiPopover, setShowAiPopover] = useState(false);
  const [showAffiliatePopover, setShowAffiliatePopover] = useState(false);

  if (!editor) return null;

  const btnClass = (active: boolean) =>
    `rounded px-2 py-1 text-xs font-medium transition-colors ${
      active
        ? "bg-gray-800 text-white dark:text-gray-900"
        : "bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-200"
    }`;

  return (
    <div className="flex flex-wrap gap-1 border-b border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-800/50 px-2 py-1.5">
      <button
        type="button"
        onClick={() => editor.chain().focus().toggleBold().run()}
        className={btnClass(editor.isActive("bold"))}
        title="Bold"
      >
        B
      </button>
      <button
        type="button"
        onClick={() => editor.chain().focus().toggleItalic().run()}
        className={btnClass(editor.isActive("italic"))}
        title="Italic"
      >
        I
      </button>
      <button
        type="button"
        onClick={() => editor.chain().focus().toggleUnderline().run()}
        className={btnClass(editor.isActive("underline"))}
        title="Underline"
      >
        U
      </button>
      <button
        type="button"
        onClick={() => editor.chain().focus().toggleStrike().run()}
        className={btnClass(editor.isActive("strike"))}
        title="Strikethrough"
      >
        S
      </button>

      <span className="mx-1 border-l border-gray-300 dark:border-gray-700" />

      <button
        type="button"
        onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
        className={btnClass(editor.isActive("heading", { level: 2 }))}
        title="Heading 2"
      >
        H2
      </button>
      <button
        type="button"
        onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
        className={btnClass(editor.isActive("heading", { level: 3 }))}
        title="Heading 3"
      >
        H3
      </button>
      <button
        type="button"
        onClick={() => editor.chain().focus().toggleHeading({ level: 4 }).run()}
        className={btnClass(editor.isActive("heading", { level: 4 }))}
        title="Heading 4"
      >
        H4
      </button>

      <span className="mx-1 border-l border-gray-300 dark:border-gray-700" />

      <button
        type="button"
        onClick={() => editor.chain().focus().toggleBulletList().run()}
        className={btnClass(editor.isActive("bulletList"))}
        title="Bullet List"
      >
        &bull; List
      </button>
      <button
        type="button"
        onClick={() => editor.chain().focus().toggleOrderedList().run()}
        className={btnClass(editor.isActive("orderedList"))}
        title="Ordered List"
      >
        1. List
      </button>

      <span className="mx-1 border-l border-gray-300 dark:border-gray-700" />

      <button
        type="button"
        onClick={() => editor.chain().focus().toggleBlockquote().run()}
        className={btnClass(editor.isActive("blockquote"))}
        title="Blockquote"
      >
        &ldquo; Quote
      </button>
      <button
        type="button"
        onClick={() => editor.chain().focus().toggleCodeBlock().run()}
        className={btnClass(editor.isActive("codeBlock"))}
        title="Code Block"
      >
        {"</>"}
      </button>
      <button
        type="button"
        onClick={() => editor.chain().focus().setHorizontalRule().run()}
        className={btnClass(false)}
        title="Horizontal Rule"
      >
        &mdash;
      </button>

      <span className="mx-1 border-l border-gray-300 dark:border-gray-700" />

      <div className="relative">
        <button
          type="button"
          onClick={() => {
            setShowLinkPopover(!showLinkPopover);
            setShowImagePopover(false);
            setShowAffiliatePopover(false);
          }}
          className={btnClass(editor.isActive("link"))}
          title="Add Link"
        >
          Link
        </button>
        {showLinkPopover && (
          <UrlPopover
            label="URL"
            placeholder="https://example.com"
            onSubmit={(url) => {
              if (!isSafeUrl(url)) return;
              editor.chain().focus().setLink({ href: url }).run();
              setShowLinkPopover(false);
            }}
            onCancel={() => setShowLinkPopover(false)}
          />
        )}
      </div>
      {editor.isActive("link") && (
        <button
          type="button"
          onClick={() => editor.chain().focus().unsetLink().run()}
          className={btnClass(false)}
          title="Remove Link"
        >
          Unlink
        </button>
      )}
      {products && products.length > 0 && (
        <div className="relative">
          <button
            type="button"
            onClick={() => {
              setShowAffiliatePopover(!showAffiliatePopover);
              setShowLinkPopover(false);
              setShowImagePopover(false);
              setShowVideoPopover(false);
            }}
            className={btnClass(showAffiliatePopover)}
            title="Insert affiliate product link"
          >
            $ Affiliate
          </button>
          {showAffiliatePopover && (
            <AffiliatePopover
              editor={editor}
              products={products}
              open={showAffiliatePopover}
              onClose={() => setShowAffiliatePopover(false)}
            />
          )}
        </div>
      )}
      <div className="relative">
        <button
          type="button"
          onClick={() => {
            setShowImagePopover(!showImagePopover);
            setShowLinkPopover(false);
            setShowVideoPopover(false);
            setShowAffiliatePopover(false);
          }}
          className={btnClass(false)}
          title="Insert Image"
        >
          Image
        </button>
        {showImagePopover && (
          <UrlPopover
            label="Image URL"
            placeholder="https://example.com/image.jpg"
            onSubmit={(url) => {
              if (!isHttpUrl(url)) return;
              editor.chain().focus().setImage({ src: url }).run();
              setShowImagePopover(false);
            }}
            onCancel={() => setShowImagePopover(false)}
          />
        )}
      </div>
      <div className="relative">
        <button
          type="button"
          onClick={() => {
            setShowVideoPopover(!showVideoPopover);
            setShowLinkPopover(false);
            setShowImagePopover(false);
            setShowAffiliatePopover(false);
          }}
          className={btnClass(editor.isActive("youtube"))}
          title="Embed YouTube/Vimeo Video"
        >
          Video
        </button>
        {showVideoPopover && (
          <UrlPopover
            label="Video URL"
            placeholder="https://youtube.com/watch?v=... or https://vimeo.com/..."
            onSubmit={(url) => {
              if (!isHttpUrl(url)) return;
              editor.commands.setYoutubeVideo({ src: url });
              setShowVideoPopover(false);
            }}
            onCancel={() => setShowVideoPopover(false)}
          />
        )}
      </div>

      <span className="mx-1 border-l border-gray-300 dark:border-gray-700" />

      <div className="relative">
        <button
          type="button"
          onClick={() => {
            setShowAiPopover(!showAiPopover);
            setShowLinkPopover(false);
            setShowImagePopover(false);
            setShowVideoPopover(false);
            setShowAffiliatePopover(false);
          }}
          className={btnClass(showAiPopover)}
          title="AI rewrite / expand"
        >
          AI
        </button>
        {showAiPopover && (
          <AiPopover editor={editor} open={showAiPopover} onClose={() => setShowAiPopover(false)} />
        )}
      </div>
    </div>
  );
}

export function RichEditor({ value, onChange, products }: RichEditorProps) {
  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: { levels: [2, 3, 4] },
        // StarterKit v3 includes Link and Underline by default. We add them
        // separately below with custom configuration (openOnClick, validate,
        // HTMLAttributes) that StarterKit's options don't support. Disabling
        // them here prevents the "Duplicate extension names" warning.
        link: false,
        underline: false,
      }),
      Link.configure({
        openOnClick: false,
        HTMLAttributes: { rel: "noopener noreferrer nofollow" },
        // Reject `javascript:`, `data:`, etc. during paste / autolink so the
        // editor never renders an unsafe anchor, even though server-side
        // sanitization would strip it on save.
        validate: (href) => isSafeUrl(href),
      }),
      Image.configure({
        HTMLAttributes: { class: "rounded-lg" },
      }),
      Underline,
      Youtube.configure({
        HTMLAttributes: { class: "rounded-lg" },
        width: 640,
        height: 360,
      }),
    ],
    content: value,
    onUpdate: ({ editor: e }) => {
      // F-23: Assert TipTap output passes sanitize-html before rendering
      const rawHtml = e.getHTML();
      try {
        const sanitizedHtml = sanitizeHtml(rawHtml);
        onChange(sanitizedHtml);
      } catch (err) {
        // If sanitization fails (e.g., input too long), reject the change.
        // Client-side editor surface — browser console is the appropriate sink
        // here; the structured server logger is not reachable from the client.
        // eslint-disable-next-line no-console -- client-side editor failure surfacing
        console.error("TipTap output sanitization failed:", err);
        // Don't update onChange - the editor will revert to the last valid state
      }
    },
    editorProps: {
      attributes: {
        class:
          "prose prose-sm max-w-none p-3 min-h-[300px] focus:outline-none prose-headings:font-semibold prose-a:text-emerald-600",
      },
    },
  });

  // Sync external value changes (e.g. when loading saved content or form reset)
  useEffect(() => {
    if (editor && value !== editor.getHTML()) {
      editor.commands.setContent(value, { emitUpdate: false });
    }
  }, [editor, value]);

  return (
    <div className="overflow-hidden rounded-lg border border-gray-300 dark:border-gray-700 focus-within:border-blue-500 focus-within:ring-1 focus-within:ring-blue-500">
      <MenuBar editor={editor} products={products} />
      <EditorContent editor={editor} />
    </div>
  );
}
