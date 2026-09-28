'use client';

import { useState } from 'react';

interface Top6SubtitleEditorProps {
  currentSubtitle: string;
  onSave: (subtitle: string) => void;
  storageKey: string;
}

export function Top6SubtitleEditor({
  currentSubtitle,
  onSave,
  storageKey,
}: Top6SubtitleEditorProps) {
  const [editing, setEditing] = useState(false);
  const [subtitle, setSubtitle] = useState(currentSubtitle);

  const handleSave = () => {
    const trimmed = subtitle.trim();
    if (trimmed) {
      localStorage.setItem(`${storageKey}-top6-subtitle`, trimmed);
      onSave(trimmed);
    }
    setEditing(false);
  };

  const handleCancel = () => {
    setSubtitle(currentSubtitle);
    setEditing(false);
  };

  if (!editing) {
    return (
      <button
        onClick={() => setEditing(true)}
        type="button"
        className="btn btn-secondary group"
      >
        <svg className="w-4 h-4 text-zinc-400 group-hover:text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
        </svg>
        <span>Edit Subtitle</span>
      </button>
    );
  }

  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-4 space-y-3">
      <div>
        <label htmlFor="top6-subtitle-input" className="block text-sm font-medium text-zinc-300 mb-2">
          Showcase Subtitle
        </label>
        <input
          id="top6-subtitle-input"
          type="text"
          value={subtitle}
          onChange={(e) => setSubtitle(e.target.value)}
          placeholder="e.g., The Games That Shaped Who I Am"
          maxLength={60}
          className="w-full px-4 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-emerald-500"
          autoFocus
        />
        <p className="text-xs text-zinc-400 mt-1">
          {subtitle.length}/60 characters
        </p>
      </div>

      <div className="flex gap-2">
        <button
          onClick={handleSave}
          disabled={!subtitle.trim()}
          className="flex-1 px-4 py-2 bg-zinc-50 hover:bg-zinc-200 text-zinc-950 font-medium rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed text-sm font-medium"
        >
          Save
        </button>
        <button
          onClick={handleCancel}
          className="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-white rounded-lg transition-colors text-sm"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
