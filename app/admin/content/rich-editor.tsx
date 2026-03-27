"use client";

import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Link from "@tiptap/extension-link";
import Image from "@tiptap/extension-image";
import Underline from "@tiptap/extension-underline";

interface RichEditorProps {
  value: string;
  onChange: (html: string) => void;
}

export function RichEditor({ value, onChange }: RichEditorProps) {
  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: { levels: [2, 3, 4] },
      }),
      Link.configure({
        openOnClick: false,
        HTMLAttributes: { rel: "noopener noreferrer nofollow", target: "_blank" },
      }),
      Image,
      Underline,
    ],
    content: value,
    onUpdate: ({ editor: e }) => {
      onChange(e.getHTML());
    },
    editorProps: {
      attributes: {
        class:
          "prose prose-sm max-w-none min-h-[200px] p-3 focus:outline-none",
      },
    },
  });

  if (!editor) return null;

  return (
    <div className="overflow-hidden rounded border border-gray-300 bg-white focus-within:border-blue-500">
      <Toolbar editor={editor} />
      <EditorContent editor={editor} />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Toolbar                                                           */
/* ------------------------------------------------------------------ */

import type { Editor } from "@tiptap/react";

function Toolbar({ editor }: { editor: Editor }) {
  function btn(
    label: string,
    action: () => void,
    isActive: boolean,
  ) {
    return (
      <button
        key={label}
        type="button"
        onClick={action}
        className={`rounded px-2 py-1 text-xs font-medium transition-colors ${
          isActive
            ? "bg-gray-900 text-white"
            : "text-gray-600 hover:bg-gray-100"
        }`}
        title={label}
      >
        {label}
      </button>
    );
  }

  function addLink() {
    const url = window.prompt("URL");
    if (!url) return;
    editor.chain().focus().setLink({ href: url }).run();
  }

  function addImage() {
    const url = window.prompt("Image URL");
    if (!url) return;
    editor.chain().focus().setImage({ src: url }).run();
  }

  return (
    <div className="flex flex-wrap gap-1 border-b border-gray-200 bg-gray-50 px-2 py-1.5">
      {btn("B", () => editor.chain().focus().toggleBold().run(), editor.isActive("bold"))}
      {btn("I", () => editor.chain().focus().toggleItalic().run(), editor.isActive("italic"))}
      {btn("U", () => editor.chain().focus().toggleUnderline().run(), editor.isActive("underline"))}
      {btn("S", () => editor.chain().focus().toggleStrike().run(), editor.isActive("strike"))}

      <span className="mx-1 border-l border-gray-300" />

      {btn("H2", () => editor.chain().focus().toggleHeading({ level: 2 }).run(), editor.isActive("heading", { level: 2 }))}
      {btn("H3", () => editor.chain().focus().toggleHeading({ level: 3 }).run(), editor.isActive("heading", { level: 3 }))}
      {btn("H4", () => editor.chain().focus().toggleHeading({ level: 4 }).run(), editor.isActive("heading", { level: 4 }))}

      <span className="mx-1 border-l border-gray-300" />

      {btn("UL", () => editor.chain().focus().toggleBulletList().run(), editor.isActive("bulletList"))}
      {btn("OL", () => editor.chain().focus().toggleOrderedList().run(), editor.isActive("orderedList"))}
      {btn("Quote", () => editor.chain().focus().toggleBlockquote().run(), editor.isActive("blockquote"))}
      {btn("Code", () => editor.chain().focus().toggleCodeBlock().run(), editor.isActive("codeBlock"))}

      <span className="mx-1 border-l border-gray-300" />

      {btn("Link", addLink, editor.isActive("link"))}
      {btn("Image", addImage, false)}
      {btn("HR", () => editor.chain().focus().setHorizontalRule().run(), false)}

      <span className="mx-1 border-l border-gray-300" />

      {btn("Undo", () => editor.chain().focus().undo().run(), false)}
      {btn("Redo", () => editor.chain().focus().redo().run(), false)}
    </div>
  );
}
