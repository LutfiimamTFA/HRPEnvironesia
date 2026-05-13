"use client";

import React, { useState, useEffect, useRef } from "react";
import { getAuth } from "firebase/auth";
import { User } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface SecureDriveImageProps {
  fileId?: string;
  alt?: string;
  className?: string;
  onError?: (error: Error) => void;
  fallbackIcon?: React.ReactNode;
}

/**
 * SecureDriveImage:
 * - Fetches files from /api/storage/view with Firebase Authorization token
 * - Converts response to blob and creates object URL
 * - Handles image load errors gracefully
 * - Revokes object URL on unmount to prevent memory leak
 * - Shows fallback icon if fileId missing or image fails to load
 */
export function SecureDriveImage({
  fileId,
  alt = "Secure Drive Image",
  className = "",
  onError,
  fallbackIcon = <User className="h-full w-full text-slate-400" />,
}: SecureDriveImageProps) {
  const [imageSrc, setImageSrc] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [showFallback, setShowFallback] = useState(() => {
    return !(typeof fileId === "string" && fileId.trim().length > 0);
  });
  const objectUrlRef = useRef<string | null>(null);
  const { toast } = useToast();

  useEffect(() => {
    const normalizedFileId =
      typeof fileId === "string" && fileId.trim().length > 0
        ? fileId.trim()
        : null;

    if (!normalizedFileId) {
      setShowFallback(true);
      setImageSrc(null);
      return;
    }

    let isMounted = true;

    const fetchSecureImage = async () => {
      setIsLoading(true);
      setShowFallback(false);

      try {
        const auth = getAuth();
        const currentUser = auth.currentUser;

        if (!currentUser) {
          throw new Error(
            "Autentikasi tidak ditemukan. Silakan login kembali.",
          );
        }

        const token = await currentUser.getIdToken();

        const response = await fetch(
          `/api/storage/view?fileId=${normalizedFileId}`,
          {
            headers: {
              Authorization: `Bearer ${token}`,
            },
          },
        );

        if (!response.ok) {
          const errorData = await response
            .json()
            .catch(() => ({ message: response.statusText }));

          let errorMessage = "Gagal memuat gambar";

          if (response.status === 401) {
            errorMessage =
              "Sesi telah berakhir. Silakan login kembali untuk melihat gambar.";
          } else if (response.status === 403) {
            errorMessage =
              "Anda tidak memiliki akses untuk melihat file ini. Hubungi administrator.";
          } else if (response.status === 404) {
            errorMessage =
              "File tidak ditemukan. File mungkin telah dihapus atau fileId tidak valid.";
          } else if (response.status >= 500) {
            errorMessage =
              "Server penyimpanan sedang bermasalah. Silakan coba lagi nanti.";
          }

          const error = new Error(errorMessage);
          if (onError) onError(error);
          if (isMounted) {
            setShowFallback(true);
            setImageSrc(null);
          }
          return;
        }

        const blob = await response.blob();

        if (!isMounted) return;

        // Revoke previous object URL if exists
        if (objectUrlRef.current) {
          URL.revokeObjectURL(objectUrlRef.current);
        }

        const url = URL.createObjectURL(blob);
        objectUrlRef.current = url;

        setImageSrc(url);
        setShowFallback(false);
      } catch (error) {
        console.error("SecureDriveImage fetch error:", error);
        const err = error instanceof Error ? error : new Error(String(error));
        if (onError) onError(err);
        if (isMounted) {
          setShowFallback(true);
          setImageSrc(null);
        }
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    };

    fetchSecureImage();

    return () => {
      isMounted = false;
    };
  }, [fileId, onError]);

  // Revoke object URL on unmount
  useEffect(() => {
    return () => {
      if (objectUrlRef.current) {
        URL.revokeObjectURL(objectUrlRef.current);
      }
    };
  }, []);

  if (showFallback || !imageSrc) {
    return (
      <div
        className={`flex items-center justify-center bg-slate-800 ${className}`}
      >
        {fallbackIcon}
      </div>
    );
  }

  return (
    <img
      src={imageSrc}
      alt={alt}
      className={className}
      onError={() => {
        setShowFallback(true);
        setImageSrc(null);
      }}
    />
  );
}
