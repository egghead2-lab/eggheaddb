import { useEditor, EditorContent } from '@tiptap/react';
import { Extension } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import Link from '@tiptap/extension-link';
import Underline from '@tiptap/extension-underline';
import TextAlign from '@tiptap/extension-text-align';
import { TextStyle } from '@tiptap/extension-text-style';
import { Color } from '@tiptap/extension-color';
import Placeholder from '@tiptap/extension-placeholder';
import { useEffect } from 'react';

const INDENT_STEP = 24; // px per indent level
const MAX_INDENT = 8;

// Custom indent extension: adds a margin-left attribute to paragraphs/headings
// so non-list text can be indented (Gmail-style). Lists use sink/liftListItem.
const Indent = Extension.create({
  name: 'indent',
  addOptions() {
    return { types: ['paragraph', 'heading'] };
  },
  addGlobalAttributes() {
    return [{
      types: this.options.types,
      attributes: {
        indent: {
          default: 0,
          parseHTML: element => {
            const ml = parseInt(element.style.marginLeft, 10);
            return ml ? Math.round(ml / INDENT_STEP) : 0;
          },
          renderHTML: attributes => {
            if (!attributes.indent) return {};
            return { style: `margin-left: ${attributes.indent * INDENT_STEP}px` };
          },
        },
      },
    }];
  },
  addCommands() {
    const apply = (delta) => ({ state, tr, dispatch }) => {
      const { from, to } = state.selection;
      let changed = false;
      state.doc.nodesBetween(from, to, (node, pos) => {
        if (this.options.types.includes(node.type.name)) {
          const current = node.attrs.indent || 0;
          const next = Math.max(0, Math.min(MAX_INDENT, current + delta));
          if (next !== current) {
            tr.setNodeMarkup(pos, undefined, { ...node.attrs, indent: next });
            changed = true;
          }
        }
      });
      if (changed && dispatch) dispatch(tr);
      return changed;
    };
    return {
      indentText: () => apply(1),
      outdentText: () => apply(-1),
    };
  },
});

// Preset font colors for the quick swatches.
const COLOR_PRESETS = ['#1f2937', '#1e3a5f', '#b91c1c', '#047857', '#2563eb', '#b45309', '#7c3aed', '#6b7280'];

function ToolbarButton({ active, onClick, title, children, disabled }) {
  return (
    <button type="button" onClick={onClick} title={title} disabled={disabled}
      className={`px-1.5 py-1 rounded text-xs font-medium transition-colors disabled:opacity-30 ${
        active ? 'bg-[#1e3a5f] text-white' : 'text-gray-500 hover:bg-gray-100 hover:text-gray-700'
      }`}>
      {children}
    </button>
  );
}

/**
 * Rich text editor based on TipTap.
 * @param {{ value?: string, onChange: (html: string) => void, placeholder?: string, minHeight?: string }} props
 */
export function RichTextEditor({ value, onChange, placeholder = 'Write something…', minHeight = '120px', editorRef }) {
  const editor = useEditor({
    extensions: [
      StarterKit.configure({ heading: { levels: [2, 3] } }),
      Underline,
      Link.configure({ openOnClick: false, HTMLAttributes: { class: 'text-[#1e3a5f] underline' } }),
      TextAlign.configure({ types: ['heading', 'paragraph'] }),
      TextStyle,
      Color,
      Indent,
      Placeholder.configure({ placeholder }),
    ],
    content: value || '',
    onUpdate: ({ editor }) => {
      onChange(editor.getHTML());
    },
  });

  // Expose editor via ref
  useEffect(() => {
    if (editorRef && editor) editorRef.current = editor;
  }, [editor, editorRef]);

  // Sync external value changes (e.g. loading template)
  useEffect(() => {
    if (editor && value !== undefined && value !== editor.getHTML()) {
      editor.commands.setContent(value || '');
    }
  }, [value]);

  if (!editor) return null;

  const addLink = () => {
    const url = prompt('Enter URL:');
    if (url) editor.chain().focus().extendMarkRange('link').setLink({ href: url }).run();
  };

  const currentColor = editor.getAttributes('textStyle').color || '';

  const indent = () => {
    if (editor.isActive('listItem')) editor.chain().focus().sinkListItem('listItem').run();
    else editor.chain().focus().indentText().run();
  };
  const outdent = () => {
    if (editor.isActive('listItem')) editor.chain().focus().liftListItem('listItem').run();
    else editor.chain().focus().outdentText().run();
  };

  return (
    <div className="border border-gray-300 rounded-lg overflow-hidden focus-within:ring-1 focus-within:ring-[#1e3a5f] focus-within:border-[#1e3a5f]">
      {/* Toolbar */}
      <div className="flex items-center gap-0.5 px-2 py-1.5 bg-gray-50 border-b border-gray-200 flex-wrap">
        <ToolbarButton active={editor.isActive('bold')} onClick={() => editor.chain().focus().toggleBold().run()} title="Bold">
          <strong>B</strong>
        </ToolbarButton>
        <ToolbarButton active={editor.isActive('italic')} onClick={() => editor.chain().focus().toggleItalic().run()} title="Italic">
          <em>I</em>
        </ToolbarButton>
        <ToolbarButton active={editor.isActive('underline')} onClick={() => editor.chain().focus().toggleUnderline().run()} title="Underline">
          <span className="underline">U</span>
        </ToolbarButton>
        <div className="w-px h-4 bg-gray-300 mx-1" />

        {/* Font color */}
        <div className="flex items-center gap-0.5">
          {COLOR_PRESETS.map(c => (
            <button key={c} type="button" title={`Color ${c}`}
              onClick={() => editor.chain().focus().setColor(c).run()}
              className={`w-4 h-4 rounded-sm border ${currentColor.toLowerCase() === c.toLowerCase() ? 'ring-1 ring-offset-1 ring-[#1e3a5f] border-white' : 'border-gray-300'}`}
              style={{ backgroundColor: c }} />
          ))}
          <label title="Custom color" className="w-4 h-4 rounded-sm border border-gray-300 cursor-pointer flex items-center justify-center text-[8px] text-gray-500 overflow-hidden bg-gradient-to-br from-pink-400 via-yellow-300 to-blue-400">
            <input type="color" value={currentColor || '#000000'}
              onChange={e => editor.chain().focus().setColor(e.target.value).run()}
              className="opacity-0 w-0 h-0" />
          </label>
          {currentColor && (
            <ToolbarButton onClick={() => editor.chain().focus().unsetColor().run()} title="Clear color">✕</ToolbarButton>
          )}
        </div>
        <div className="w-px h-4 bg-gray-300 mx-1" />

        <ToolbarButton active={editor.isActive('heading', { level: 2 })} onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()} title="Heading">
          H2
        </ToolbarButton>
        <ToolbarButton active={editor.isActive('heading', { level: 3 })} onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()} title="Subheading">
          H3
        </ToolbarButton>
        <div className="w-px h-4 bg-gray-300 mx-1" />

        {/* Alignment */}
        <ToolbarButton active={editor.isActive({ textAlign: 'left' })} onClick={() => editor.chain().focus().setTextAlign('left').run()} title="Align left">⇤</ToolbarButton>
        <ToolbarButton active={editor.isActive({ textAlign: 'center' })} onClick={() => editor.chain().focus().setTextAlign('center').run()} title="Align center">↔</ToolbarButton>
        <ToolbarButton active={editor.isActive({ textAlign: 'right' })} onClick={() => editor.chain().focus().setTextAlign('right').run()} title="Align right">⇥</ToolbarButton>
        <div className="w-px h-4 bg-gray-300 mx-1" />

        <ToolbarButton active={editor.isActive('bulletList')} onClick={() => editor.chain().focus().toggleBulletList().run()} title="Bullet list">
          &bull; List
        </ToolbarButton>
        <ToolbarButton active={editor.isActive('orderedList')} onClick={() => editor.chain().focus().toggleOrderedList().run()} title="Numbered list">
          1. List
        </ToolbarButton>
        {/* Indent / outdent */}
        <ToolbarButton onClick={outdent} title="Decrease indent">⇲</ToolbarButton>
        <ToolbarButton onClick={indent} title="Increase indent">⇱</ToolbarButton>
        <div className="w-px h-4 bg-gray-300 mx-1" />

        <ToolbarButton active={editor.isActive('link')} onClick={addLink} title="Add link">
          Link
        </ToolbarButton>
        {editor.isActive('link') && (
          <ToolbarButton onClick={() => editor.chain().focus().unsetLink().run()} title="Remove link">
            Unlink
          </ToolbarButton>
        )}
        <div className="w-px h-4 bg-gray-300 mx-1" />
        <ToolbarButton active={editor.isActive('blockquote')} onClick={() => editor.chain().focus().toggleBlockquote().run()} title="Quote">
          &ldquo; Quote
        </ToolbarButton>
        <ToolbarButton onClick={() => editor.chain().focus().setHorizontalRule().run()} title="Divider">
          &mdash;
        </ToolbarButton>
      </div>

      {/* Editor */}
      <EditorContent editor={editor}
        className="prose prose-sm max-w-none px-3 py-2 text-sm focus:outline-none"
        style={{ minHeight }} />
    </div>
  );
}
