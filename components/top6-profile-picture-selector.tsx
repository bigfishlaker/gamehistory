'use client';

import { useState } from 'react';
import type { PlayerProfile } from '@/lib/types';

interface Top6ProfilePictureSelectorProps {
  profiles: PlayerProfile[];
  currentPictureUrl?: string;
  onSelect: (url: string) => void;
  storageKey: string;
}

export function Top6ProfilePictureSelector({
  profiles,
  currentPictureUrl,
  onSelect,
  storageKey,
}: Top6ProfilePictureSelectorProps) {
  const [showSelector, setShowSelector] = useState(false);
  const [uploading, setUploading] = useState(false);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      alert('Please select an image file');
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      alert('Image must be smaller than 5MB');
      return;
    }

    setUploading(true);

    try {
      const reader = new FileReader();
      reader.onloadend = () => {
        const dataUrl = reader.result as string;
        localStorage.setItem(`${storageKey}-top6-pfp`, dataUrl);
        onSelect(dataUrl);
        setShowSelector(false);
      };
      reader.readAsDataURL(file);
    } catch (error) {
      console.error('Failed to upload image:', error);
      alert('Failed to upload image');
    } finally {
      setUploading(false);
    }
  };

  const handleSelectAvatar = (url: string) => {
    localStorage.setItem(`${storageKey}-top6-pfp`, url);
    onSelect(url);
    setShowSelector(false);
  };

  const avatars = profiles.map(p => ({
    url: p.avatarUrl,
    name: p.displayName,
    platform: p.platform,
  })).filter(a => a.url);

  return (
    <div className="relative">
      <button
        type="button"
        aria-expanded={showSelector}
        onClick={() => setShowSelector(!showSelector)}
        className="btn btn-secondary"
      >
        {currentPictureUrl ? (
          <>
            <img
              src={currentPictureUrl}
              alt="Current showcase picture"
              className="w-6 h-6 rounded-full"
            />
            <span>Change Picture</span>
          </>
        ) : (
          <>
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
            </svg>
            <span>Select Picture</span>
          </>
        )}
      </button>

      {showSelector && (
        <div className="absolute top-full left-0 mt-2 bg-zinc-900 border border-zinc-800 rounded-lg p-4 shadow-lg z-50 w-80">
          <div className="mb-4">
            <h3 className="font-semibold text-white mb-2">Choose Profile Picture</h3>
            <p className="text-xs text-zinc-400">This will appear on your Top 6 showcase</p>
          </div>

          {/* Upload option */}
          <div className="mb-4">
            <label className="block w-full">
              <div className="flex items-center gap-3 px-4 py-3 bg-zinc-800 hover:bg-zinc-700 rounded-lg cursor-pointer transition-colors border-2 border-dashed border-zinc-700">
                <svg className="w-5 h-5 text-zinc-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
                <span className="text-sm text-white">
                  {uploading ? 'Uploading...' : 'Upload Custom Picture'}
                </span>
              </div>
              <input
                type="file"
                accept="image/*"
                onChange={handleFileUpload}
                disabled={uploading}
                className="hidden"
              />
            </label>
            <p className="text-xs text-zinc-400 mt-1">Max 5MB, any image format</p>
          </div>

          {/* Account avatars */}
          {avatars.length > 0 && (
            <div>
              <h4 className="text-xs font-medium text-zinc-400 mb-2">Or choose from your accounts:</h4>
              <div className="space-y-2">
                {avatars.map((avatar, index) => (
                  <button
                    key={index}
                    onClick={() => handleSelectAvatar(avatar.url!)}
                    className="flex items-center gap-3 w-full px-3 py-2 bg-zinc-800 hover:bg-zinc-700 rounded-lg transition-colors"
                  >
                    <img
                      src={avatar.url!}
                      alt={avatar.name}
                      className="w-10 h-10 rounded-full"
                    />
                    <div className="text-left">
                      <div className="text-sm text-white">{avatar.name}</div>
                      <div className="text-xs text-zinc-400 capitalize">{avatar.platform}</div>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="mt-4 pt-4 border-t border-zinc-800">
            <button
              onClick={() => setShowSelector(false)}
              className="w-full px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-white text-sm rounded-lg transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
