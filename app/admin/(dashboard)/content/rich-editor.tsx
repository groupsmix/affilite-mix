"use client";

import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Link from "@tiptap/extension-link";
import Image from "@tiptap/extension-image";
import Underline from "@tiptap/extension-underline";
import Youtube from "@tiptap/extension-youtube";
import { useEffect, useState, useRef, useCallback } from "react";

interface RichEditorProps {
  value: string;
  onChange: (html: string) => void;
}

/** Convert a YouTube or Vimeo URL to an embeddable URL. */
function toEmbedUrl(url: string): string | null {
  // YouTube: youtube.com/watch?v=ID, youtu.be/ID, youtube.com/embed/ID
  const ytMatch = url.match(
    /(?:youtube\.com\/(?:watch\?v=|embed\/)|youtu\.be\/)([\w-]{11})/,
  );
  if (ytMatch) return `https://www.youtube.com/embed/${ytMatch[1]}`;

  // Vimeo: vimeo.com/ID
  const vimeoMatch = url.match(/vimeo\.com\/(\d+)/);
  if (vimeoMatch) return `https://player.vimeo.com/video/${vimeoMatch[1]}`;

  return null;
}

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
    <div className="absolute left-0 top-full z-50 mt-1 flex items-center gap-2 rounded-lg border border-gray-200 bg-white p-2 shadow-lg">
      <label className="text-xs font-medium text-gray-500">{label}</label>
      <input
        ref={inputRef}
        type="url"
        value={url}
        onChange={(e) => setUrl(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && url) { e.preventDefault(); onSubmit(url); }
          if (e.key === "Escape") onCancel();
        }}
        placeholder={placeholder}
        className="w-56 rounded border border-gray-300 px-2 py-1 text-xs focus:border-blue-500 focus:outline-none"
      />
      <button
        type="button"
        onClick={() => { if (url) onSubmit(url); }}
        className="rounded bg-gray-800 px-2 py-1 text-xs font-medium text-white hover:bg-gray-700"
      >
        Add
      </button>
      <button
        type="button"
        onClick={onCancel}
        className="rounded px-2 py-1 text-xs font-medium text-gray-500 hover:bg-gray-100"
      >
        Cancel
      </button>
    </div>
  );
}

function MenuBar({ editor }: { editor: ReturnType<typeof useEditor> }) {
  const [showLinkPopover, setShowLinkPopover] = useState(false);
  const [showImagePopover, setShowImagePopover] = useState(false);
  const [showVideoPopover, setShowVideoPopover] = useState(false);

  if (!editor) return null;

  const btnClass = (active: boolean) =>
    `rounded px-2 py-1 text-xs font-medium transition-colors ${
      active
        ? "bg-gray-800 text-white"
        : "bg-gray-100 text-gray-700 hover:bg-gray-200"
    }`;

  return (
    <div className="flex flex-wrap gap-1 border-b border-gray-200 bg-gray-50 px-2 py-1.5">
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

      <span className="mx-1 border-l border-gray-300" />

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

      <span className="mx-1 border-l border-gray-300" />

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

      <span className="mx-1 border-l border-gray-300" />

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

      <span className="mx-1 border-l border-gray-300" />

      <div className="relative">
        <button
          type="button"
          onClick={() => { setShowLinkPopover(!showLinkPopover); setShowImagePopover(false); }}
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
      <div className="relative">
        <button
          type="button"
          onClick={() => { setShowImagePopover(!showImagePopover); setShowLinkPopover(false); setShowVideoPopover(false); }}
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
          onClick={() => { setShowVideoPopover(!showVideoPopover); setShowLinkPopover(false); setShowImagePopover(false); }}
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
              editor.commands.setYoutubeVideo({ src: url });
              setShowVideoPopover(false);
            }}
            onCancel={() => setShowVideoPopover(false)}
          />
        )}
      </div>
    </div>
  );
}

export function RichEditor({ value, onChange }: RichEditorProps) {
  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: { levels: [2, 3, 4] },
      }),
      Link.configure({
        openOnClick: false,
        HTMLAttributes: { rel: "noopener noreferrer nofollow" },
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
      onChange(e.getHTML());
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
    <div className="overflow-hidden rounded-lg border border-gray-300 focus-within:border-blue-500 focus-within:ring-1 focus-within:ring-blue-500">
      <MenuBar editor={editor} />
      <EditorContent editor={editor} />
    </div>
  );
}
