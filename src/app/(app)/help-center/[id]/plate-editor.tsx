"use client";

// The Plate rich-text editor used for help articles, with a small fixed
// toolbar. Kept deliberately lean: the node types here are exactly the ones
// plateToHtml (src/lib/help-html.ts) knows how to render on the public site.

import * as React from "react";
import {
  BoldIcon,
  CodeIcon,
  Heading2Icon,
  Heading3Icon,
  ImageIcon,
  ItalicIcon,
  Link2Icon,
  ListIcon,
  ListOrderedIcon,
  PilcrowIcon,
  QuoteIcon,
  Redo2Icon,
  TableIcon,
  UnderlineIcon,
  Undo2Icon,
} from "lucide-react";
import type { Value } from "platejs";
import { KEYS } from "platejs";
import {
  Plate,
  PlateContent,
  PlateElement,
  PlateLeaf,
  usePlateEditor,
  type PlateElementProps,
  type PlateLeafProps,
} from "platejs/react";
import {
  BlockquotePlugin,
  BoldPlugin,
  CodePlugin,
  H2Plugin,
  H3Plugin,
  ItalicPlugin,
  UnderlinePlugin,
} from "@platejs/basic-nodes/react";
import { LinkPlugin } from "@platejs/link/react";
import { ImagePlugin } from "@platejs/media/react";
import { ListPlugin } from "@platejs/list/react";
import { toggleList } from "@platejs/list";
import {
  TableCellHeaderPlugin,
  TableCellPlugin,
  TablePlugin,
  TableRowPlugin,
} from "@platejs/table/react";

import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";

// ---------- Element components ----------

function H2El(props: PlateElementProps) {
  return (
    <PlateElement {...props} as="h2" className="mt-6 mb-2 text-xl font-semibold tracking-tight">
      {props.children}
    </PlateElement>
  );
}
function H3El(props: PlateElementProps) {
  return (
    <PlateElement {...props} as="h3" className="mt-4 mb-1.5 text-lg font-semibold">
      {props.children}
    </PlateElement>
  );
}
function BlockquoteEl(props: PlateElementProps) {
  return (
    <PlateElement
      {...props}
      as="blockquote"
      className="my-2 rounded-r-md border-l-2 border-emerald-500 bg-emerald-50 px-4 py-2 text-sm dark:bg-emerald-950/40"
    >
      {props.children}
    </PlateElement>
  );
}
function LinkEl(props: PlateElementProps) {
  const url = String((props.element as { url?: string }).url ?? "");
  return (
    <PlateElement
      {...props}
      as="a"
      attributes={{
        ...props.attributes,
        href: url,
        title: url,
      }}
      className="text-emerald-700 underline underline-offset-2 dark:text-emerald-400"
    >
      {props.children}
    </PlateElement>
  );
}
function ImageEl(props: PlateElementProps) {
  const { url, caption } = props.element as {
    url?: string;
    caption?: { text: string }[];
  };
  const alt = caption?.map((c) => c.text).join("") ?? "";
  return (
    <PlateElement {...props} className="my-2">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={url}
        alt={alt}
        className="max-w-full rounded-md border"
        draggable={false}
        contentEditable={false}
      />
      {props.children}
    </PlateElement>
  );
}
function TableEl(props: PlateElementProps) {
  return (
    <PlateElement {...props} className="my-2 overflow-x-auto">
      <table className="w-full border-collapse text-sm">
        <tbody>{props.children}</tbody>
      </table>
    </PlateElement>
  );
}
function TrEl(props: PlateElementProps) {
  return (
    <PlateElement {...props} as="tr">
      {props.children}
    </PlateElement>
  );
}
function TdEl(props: PlateElementProps) {
  return (
    <PlateElement {...props} as="td" className="border px-3 py-1.5 align-top">
      {props.children}
    </PlateElement>
  );
}
function ThEl(props: PlateElementProps) {
  return (
    <PlateElement
      {...props}
      as="th"
      className="border bg-muted px-3 py-1.5 text-left font-medium"
    >
      {props.children}
    </PlateElement>
  );
}
function ParagraphEl(props: PlateElementProps) {
  const el = props.element as { listStyleType?: string; indent?: number };
  const isList = Boolean(el.listStyleType) && (el.indent ?? 0) > 0;
  return (
    <PlateElement
      {...props}
      as="p"
      className={cn(
        "my-1 leading-6",
        isList && "my-0.5 ml-6",
        isList && el.listStyleType === "disc" && "list-item list-disc",
        isList && el.listStyleType === "decimal" && "list-item list-decimal"
      )}
    >
      {props.children}
    </PlateElement>
  );
}
function CodeLeaf(props: PlateLeafProps) {
  return (
    <PlateLeaf
      {...props}
      as="code"
      className="rounded border bg-muted px-1 py-0.5 font-mono text-[0.85em]"
    >
      {props.children}
    </PlateLeaf>
  );
}

// ---------- Toolbar ----------

function ToolbarButton({
  onClick,
  title,
  children,
}: {
  onClick: () => void;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      className="h-8 w-8 p-0"
      title={title}
      onMouseDown={(e) => {
        e.preventDefault();
        onClick();
      }}
    >
      {children}
    </Button>
  );
}

// ---------- Editor ----------

export type HelpEditorHandle = { getValue: () => Value };

export const HelpPlateEditor = React.forwardRef<
  HelpEditorHandle,
  { initialValue: Value; readOnly?: boolean }
>(function HelpPlateEditor({ initialValue, readOnly }, ref) {
  const editor = usePlateEditor({
    plugins: [
      H2Plugin.withComponent(H2El),
      H3Plugin.withComponent(H3El),
      BlockquotePlugin.withComponent(BlockquoteEl),
      BoldPlugin,
      ItalicPlugin,
      UnderlinePlugin,
      CodePlugin.withComponent(CodeLeaf),
      LinkPlugin.withComponent(LinkEl),
      ImagePlugin.withComponent(ImageEl),
      ListPlugin,
      TablePlugin.withComponent(TableEl),
      TableRowPlugin.withComponent(TrEl),
      TableCellPlugin.withComponent(TdEl),
      TableCellHeaderPlugin.withComponent(ThEl),
    ],
    value: initialValue,
    override: {
      components: {
        [KEYS.p]: ParagraphEl,
      },
    },
  });

  React.useImperativeHandle(ref, () => ({
    getValue: () => editor.children as Value,
  }));

  const setBlock = (type: string) => {
    editor.tf.toggleBlock(type);
    editor.tf.focus();
  };
  const mark = (key: string) => {
    editor.tf.toggleMark(key);
    editor.tf.focus();
  };

  const insertLink = () => {
    const url = window.prompt("Link URL (e.g. /rewards/creating-a-reward/ or https://…)");
    if (!url) return;
    const { selection } = editor;
    const selectedText = selection ? editor.api.string(selection) : "";
    editor.tf.insertNodes({
      type: "a",
      url,
      children: [{ text: selectedText || url }],
    } as never);
    editor.tf.focus();
  };

  const insertImage = () => {
    const url = window.prompt("Image URL (e.g. /screenshots/dashboard-overview.jpg)");
    if (!url) return;
    editor.tf.insertNodes([
      { type: "img", url, children: [{ text: "" }] },
      { type: "p", children: [{ text: "" }] },
    ] as never);
    editor.tf.focus();
  };

  const insertTable = () => {
    const cell = (type: "th" | "td", text: string) => ({
      type,
      children: [{ type: "p", children: [{ text }] }],
    });
    editor.tf.insertNodes([
      {
        type: "table",
        children: [
          { type: "tr", children: [cell("th", "Column A"), cell("th", "Column B")] },
          { type: "tr", children: [cell("td", ""), cell("td", "")] },
        ],
      },
      { type: "p", children: [{ text: "" }] },
    ] as never);
    editor.tf.focus();
  };

  const list = (style: "disc" | "decimal") => {
    toggleList(editor, { listStyleType: style });
    editor.tf.focus();
  };

  return (
    <Plate editor={editor}>
      <div className="rounded-md border">
        {!readOnly && (
          <div className="flex flex-wrap items-center gap-0.5 border-b px-2 py-1">
            <ToolbarButton title="Paragraph" onClick={() => setBlock("p")}>
              <PilcrowIcon className="size-4" />
            </ToolbarButton>
            <ToolbarButton title="Heading 2" onClick={() => setBlock("h2")}>
              <Heading2Icon className="size-4" />
            </ToolbarButton>
            <ToolbarButton title="Heading 3" onClick={() => setBlock("h3")}>
              <Heading3Icon className="size-4" />
            </ToolbarButton>
            <ToolbarButton title="Tip / callout" onClick={() => setBlock("blockquote")}>
              <QuoteIcon className="size-4" />
            </ToolbarButton>
            <Separator orientation="vertical" className="mx-1 h-5" />
            <ToolbarButton title="Bold (Ctrl+B)" onClick={() => mark("bold")}>
              <BoldIcon className="size-4" />
            </ToolbarButton>
            <ToolbarButton title="Italic (Ctrl+I)" onClick={() => mark("italic")}>
              <ItalicIcon className="size-4" />
            </ToolbarButton>
            <ToolbarButton title="Underline (Ctrl+U)" onClick={() => mark("underline")}>
              <UnderlineIcon className="size-4" />
            </ToolbarButton>
            <ToolbarButton title="Inline code" onClick={() => mark("code")}>
              <CodeIcon className="size-4" />
            </ToolbarButton>
            <Separator orientation="vertical" className="mx-1 h-5" />
            <ToolbarButton title="Bulleted list" onClick={() => list("disc")}>
              <ListIcon className="size-4" />
            </ToolbarButton>
            <ToolbarButton title="Numbered list" onClick={() => list("decimal")}>
              <ListOrderedIcon className="size-4" />
            </ToolbarButton>
            <Separator orientation="vertical" className="mx-1 h-5" />
            <ToolbarButton title="Insert link" onClick={insertLink}>
              <Link2Icon className="size-4" />
            </ToolbarButton>
            <ToolbarButton title="Insert image by URL" onClick={insertImage}>
              <ImageIcon className="size-4" />
            </ToolbarButton>
            <ToolbarButton title="Insert table" onClick={insertTable}>
              <TableIcon className="size-4" />
            </ToolbarButton>
            <Separator orientation="vertical" className="mx-1 h-5" />
            <ToolbarButton title="Undo" onClick={() => editor.tf.undo()}>
              <Undo2Icon className="size-4" />
            </ToolbarButton>
            <ToolbarButton title="Redo" onClick={() => editor.tf.redo()}>
              <Redo2Icon className="size-4" />
            </ToolbarButton>
          </div>
        )}
        <PlateContent
          readOnly={readOnly}
          className="min-h-[420px] px-4 py-3 text-[15px] focus:outline-none"
          placeholder="Write the article…"
        />
      </div>
    </Plate>
  );
});
