import Image from "@tiptap/extension-image";
import { Markdown } from "@tiptap/markdown";
import { EditorContent, useEditor, useEditorState } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import {
  Bold,
  Heading2,
  ImagePlus,
  Italic,
  List,
  ListOrdered,
  TextQuote,
  type LucideIcon,
} from "lucide-react";
import { useEffect, useRef } from "react";
import type { PickedFile, Platform } from "../../app/services";
import { cx } from "../../lib/cx";

/** Las imágenes se guardan en Markdown como `attachments/<archivo>`. */
const ATTACHMENT_PREFIX = "attachments/";
const IMAGE_EXTENSIONS = ["png", "jpg", "jpeg", "gif", "webp"];
const SAVE_DELAY_MS = 600;

function attachmentName(original: string): string {
  const safe =
    original.replace(/[^\w.-]+/g, "_").replace(/^_+/, "") || "imagen";
  return `${Date.now().toString(36)}-${safe}`;
}

interface FeelingsEditorProps {
  markdown: string;
  /** `text` es el contenido sin formato, de donde salen las etiquetas. */
  onChange: (markdown: string, text: string) => void;
  platform: Platform;
  /** Nombre accesible del editor; por defecto, los feelings del día. */
  label?: string;
}

interface ToolProps {
  label: string;
  icon: LucideIcon;
  active?: boolean;
  onClick: () => void;
}

function Tool({ label, icon: Icon, active, onClick }: ToolProps) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      aria-pressed={active}
      onClick={onClick}
      className={cx(
        "flex size-9 items-center justify-center rounded-md",
        active
          ? "bg-primary text-surface"
          : "text-ink/80 hover:bg-ink/10 hover:text-ink active:bg-ink/15",
      )}
    >
      <Icon aria-hidden="true" className="size-4" />
    </button>
  );
}

/**
 * Editor de texto con formato: los feelings del día y el cuerpo de las notas.
 * Guarda Markdown poco después de teclear.
 */
export function FeelingsEditor({
  markdown,
  onChange,
  platform,
  label = "Feelings del día",
}: FeelingsEditorProps) {
  const onChangeRef = useRef(onChange);
  const pending = useRef<ReturnType<typeof setTimeout> | null>(null);
  const flushRef = useRef<() => void>(() => undefined);

  useEffect(() => {
    onChangeRef.current = onChange;
  });

  const editor = useEditor({
    extensions: [
      // El subrayado no existe en Markdown: se perdería al guardar.
      StarterKit.configure({ underline: false }),
      Image.extend({
        renderHTML({ HTMLAttributes }) {
          const src: unknown = HTMLAttributes.src;
          const shown =
            typeof src === "string" && src.startsWith(ATTACHMENT_PREFIX)
              ? platform.attachmentUrl(src.slice(ATTACHMENT_PREFIX.length))
              : src;
          return ["img", { ...HTMLAttributes, src: shown }];
        },
      }),
      Markdown,
    ],
    content: markdown,
    contentType: "markdown",
    editorProps: {
      attributes: {
        class: "notes min-h-48 flex-1 p-4",
        role: "textbox",
        "aria-multiline": "true",
        "aria-label": label,
        // El corrector del sistema va en inglés y subraya todo el texto.
        spellcheck: "false",
      },
      handlePaste(_view, event) {
        return insertImages(event.clipboardData?.files);
      },
      handleDrop(_view, event) {
        return insertImages(event.dataTransfer?.files);
      },
    },
    onUpdate() {
      if (pending.current) clearTimeout(pending.current);
      pending.current = setTimeout(() => flushRef.current(), SAVE_DELAY_MS);
    },
    onBlur() {
      flushRef.current();
    },
  });

  useEffect(() => {
    flushRef.current = () => {
      if (!pending.current) return;
      clearTimeout(pending.current);
      pending.current = null;
      onChangeRef.current(editor.getMarkdown().trim(), editor.getText());
    };
    // Al cambiar de día o salir, lo pendiente se guarda antes de desmontar.
    return () => flushRef.current();
  }, [editor]);

  async function insertImage(file: PickedFile) {
    const name = attachmentName(file.name);
    await platform.attachments.write(name, file.bytes);
    editor
      .chain()
      .focus()
      .setImage({ src: `${ATTACHMENT_PREFIX}${name}`, alt: file.name })
      .run();
  }

  function insertImages(files: FileList | undefined): boolean {
    const images = [...(files ?? [])].filter((file) =>
      file.type.startsWith("image/"),
    );
    if (images.length === 0) return false;
    void (async () => {
      for (const image of images) {
        await insertImage({
          name: image.name,
          bytes: new Uint8Array(await image.arrayBuffer()),
        });
      }
    })();
    return true;
  }

  const active = useEditorState({
    editor,
    selector: ({ editor: current }) => ({
      bold: current.isActive("bold"),
      italic: current.isActive("italic"),
      heading: current.isActive("heading", { level: 2 }),
      bulletList: current.isActive("bulletList"),
      orderedList: current.isActive("orderedList"),
      blockquote: current.isActive("blockquote"),
    }),
  });

  const chain = () => editor.chain().focus();

  return (
    <div className="border-ink/10 bg-panel flex min-h-0 flex-1 flex-col rounded-md border">
      <div
        role="toolbar"
        aria-label="Formato del texto"
        className="border-ink/20 flex flex-wrap gap-2 border-b p-2"
      >
        <Tool
          label="Negrita"
          icon={Bold}
          active={active.bold}
          onClick={() => chain().toggleBold().run()}
        />
        <Tool
          label="Cursiva"
          icon={Italic}
          active={active.italic}
          onClick={() => chain().toggleItalic().run()}
        />
        <Tool
          label="Título"
          icon={Heading2}
          active={active.heading}
          onClick={() => chain().toggleHeading({ level: 2 }).run()}
        />
        <Tool
          label="Lista"
          icon={List}
          active={active.bulletList}
          onClick={() => chain().toggleBulletList().run()}
        />
        <Tool
          label="Lista numerada"
          icon={ListOrdered}
          active={active.orderedList}
          onClick={() => chain().toggleOrderedList().run()}
        />
        <Tool
          label="Cita"
          icon={TextQuote}
          active={active.blockquote}
          onClick={() => chain().toggleBlockquote().run()}
        />
        <Tool
          label="Insertar imagen"
          icon={ImagePlus}
          onClick={() =>
            void platform
              .pickFile({ title: "Imagen", extensions: IMAGE_EXTENSIONS })
              .then((file) => (file ? insertImage(file) : undefined))
          }
        />
      </div>
      <EditorContent
        editor={editor}
        className="flex min-h-0 flex-1 flex-col relative overflow-auto"
      />
    </div>
  );
}
