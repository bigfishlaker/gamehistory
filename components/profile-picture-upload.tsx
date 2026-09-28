'use client';

import { useState, useRef } from 'react';

interface ProfilePictureUploadProps {
  storageKey: string;
  defaultAvatar?: string;
}

export function ProfilePictureUpload({ storageKey, defaultAvatar }: ProfilePictureUploadProps) {
  const [avatarUrl, setAvatarUrl] = useState<string | null>(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem(storageKey);
    }
    return null;
  });
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const resizeImage = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        const img = new Image();
        img.onload = () => {
          const canvas = document.createElement('canvas');
          const size = 256;
          canvas.width = size;
          canvas.height = size;

          const ctx = canvas.getContext('2d');
          if (!ctx) {
            reject(new Error('Failed to get canvas context'));
            return;
          }

          const scale = Math.max(size / img.width, size / img.height);
          const x = (size - img.width * scale) / 2;
          const y = (size - img.height * scale) / 2;

          ctx.drawImage(img, x, y, img.width * scale, img.height * scale);

          resolve(canvas.toDataURL('image/png'));
        };
        img.onerror = () => reject(new Error('Failed to load image'));
        img.src = e.target?.result as string;
      };
      reader.onerror = () => reject(new Error('Failed to read file'));
      reader.readAsDataURL(file);
    });
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 2 * 1024 * 1024) {
      alert('File size must be less than 2MB');
      return;
    }

    if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) {
      alert('Only PNG, JPG, and WebP images are supported');
      return;
    }

    try {
      setUploading(true);
      const dataUrl = await resizeImage(file);
      localStorage.setItem(storageKey, dataUrl);
      setAvatarUrl(dataUrl);
    } catch (error) {
      console.error('Failed to process image:', error);
      alert('Failed to process image');
    } finally {
      setUploading(false);
    }
  };

  const handleRemove = () => {
    localStorage.removeItem(storageKey);
    setAvatarUrl(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const displayUrl = avatarUrl || defaultAvatar;

  return (
    <div className="flex items-center gap-4">
      <div className="relative">
        {displayUrl ? (
          <img
            src={displayUrl}
            alt="Profile"
            className="w-24 h-24 rounded-full object-cover border border-zinc-700"
          />
        ) : (
          <div className="w-24 h-24 rounded-full bg-zinc-800 border border-zinc-700 flex items-center justify-center text-zinc-400">
            No photo
          </div>
        )}
      </div>

      <div className="flex flex-col gap-2">
        <input
          ref={fileInputRef}
          type="file"
          accept="image/png,image/jpeg,image/webp"
          onChange={handleFileChange}
          className="hidden"
          id="profile-picture-input"
        />
        <label
          htmlFor="profile-picture-input"
          className={`px-4 py-2 bg-zinc-800 text-zinc-100 text-sm rounded-lg cursor-pointer hover:bg-zinc-700 transition-colors text-center ${
            uploading ? 'opacity-50 cursor-not-allowed' : ''
          }`}
        >
          {uploading ? 'Processing...' : avatarUrl ? 'Change Photo' : 'Upload Photo'}
        </label>
        {avatarUrl && (
          <button
            onClick={handleRemove}
            className="px-4 py-2 bg-red-600 text-white text-sm rounded-lg hover:bg-red-700 transition-colors"
          >
            Remove Photo
          </button>
        )}
        <p className="text-xs text-zinc-400">PNG, JPG, or WebP • Max 2MB</p>
      </div>
    </div>
  );
}
