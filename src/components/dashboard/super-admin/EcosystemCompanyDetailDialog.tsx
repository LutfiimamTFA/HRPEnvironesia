'use client';

import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Eye, Copy, Check, ExternalLink } from 'lucide-react';
import { useState } from 'react';
import type { EcosystemCompany } from '@/lib/types';
import {
  getLogoPreviewUrl,
  getLogoSourceText,
  getLocalCompanyLogo,
  getShortUrlDisplay,
} from '@/lib/ecosystem-logo-utils';
import {
  getCompanyLogoSrc,
  getCompanyLogoRenderUrl,
  getGoogleDriveViewUrl,
  formatUrlForDisplay,
  getLogoSourceDescription,
  LOGO_SIZES,
} from '@/lib/ecosystem-logo';
import { useToast } from '@/hooks/use-toast';

interface EcosystemCompanyDetailDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  item: EcosystemCompany | null;
  onEdit?: (item: EcosystemCompany) => void;
}

export function EcosystemCompanyDetailDialog({
  open,
  onOpenChange,
  item,
  onEdit,
}: EcosystemCompanyDetailDialogProps) {
  const { toast } = useToast();
  const [copiedField, setCopiedField] = useState<string | null>(null);

  if (!item) return null;

  const logoInfo = getLogoPreviewUrl(item);
  const logoSourceText = getLogoSourceText(logoInfo.source);

  const handleCopy = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    setCopiedField(label);
    toast({
      title: 'Copied',
      description: `${label} copied to clipboard`,
    });
    setTimeout(() => setCopiedField(null), 2000);
  };

  const handleEdit = () => {
    onOpenChange(false);
    // Slight delay to ensure modal closes before opening edit modal
    setTimeout(() => {
      onEdit?.(item);
    }, 100);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Eye className="h-5 w-5" />
            Detail Ecosystem Company
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-6">
          {/* Logo Preview Section - Larger and Clearer */}
          <div className="space-y-3">
            <h3 className="font-semibold text-sm">Logo Preview</h3>
            <div className={LOGO_SIZES.detailContainer}>
              <img
                src={getCompanyLogoSrc(item)}
                alt={`${item.name} logo`}
                className={LOGO_SIZES.detail}
                onError={(e) => {
                  e.currentTarget.src = getLocalCompanyLogo(item.name);
                }}
              />
            </div>
            <div className="text-xs text-muted-foreground">
              {logoSourceText} • {getLogoSourceDescription(item)}
            </div>
          </div>

          {/* Company Info Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Company Name */}
            <div className="space-y-2">
              <label className="text-xs font-semibold text-muted-foreground uppercase">
                Company Name
              </label>
              <p className="text-sm font-medium">{item.name}</p>
            </div>

            {/* Website URL */}
            <div className="space-y-2">
              <label className="text-xs font-semibold text-muted-foreground uppercase">
                Website URL
              </label>
              <div className="flex items-center gap-2">
                <a
                  href={item.websiteUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs text-blue-500 hover:underline truncate"
                  title={item.websiteUrl}
                >
                  {item.websiteUrl}
                </a>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 w-6 p-0"
                  onClick={() => handleCopy(item.websiteUrl, 'Website URL')}
                >
                  {copiedField === 'Website URL' ? (
                    <Check className="h-3 w-3 text-green-600" />
                  ) : (
                    <Copy className="h-3 w-3" />
                  )}
                </Button>
              </div>
            </div>

            {/* Sort Order */}
            <div className="space-y-2">
              <label className="text-xs font-semibold text-muted-foreground uppercase">
                Sort Order
              </label>
              <p className="text-sm font-medium">{item.sortOrder || 0}</p>
            </div>

            {/* Status */}
            <div className="space-y-2">
              <label className="text-xs font-semibold text-muted-foreground uppercase">
                Status
              </label>
              <Badge variant={item.isActive ? 'default' : 'secondary'}>
                {item.isActive ? 'Active' : 'Inactive'}
              </Badge>
            </div>
          </div>

          {/* Logo Details Section */}
          <div className="border-t pt-4 space-y-3">
            <h3 className="font-semibold text-sm">Logo Details</h3>

            {/* Logo Source */}
            <div className="space-y-2">
              <label className="text-xs font-semibold text-muted-foreground uppercase">
                Logo Source
              </label>
              <p className="text-sm">{getLogoSourceDescription(item)}</p>
            </div>

            {/* Render URL (untuk image src) */}
            {getCompanyLogoRenderUrl(item) && (
              <div className="space-y-2">
                <label className="text-xs font-semibold text-muted-foreground uppercase">
                  Logo Render URL
                </label>
                <p className="text-xs text-muted-foreground mb-2">
                  Dipakai untuk menampilkan logo di frontend
                </p>
                <div className="flex items-start gap-2">
                  <code className="text-xs bg-muted p-2 rounded flex-1 break-all font-mono">
                    {formatUrlForDisplay(getCompanyLogoRenderUrl(item), 100)}
                  </code>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-8 w-8 p-0 flex-shrink-0"
                    onClick={() => handleCopy(getCompanyLogoRenderUrl(item), 'Render URL')}
                  >
                    {copiedField === 'Render URL' ? (
                      <Check className="h-3 w-3 text-green-600" />
                    ) : (
                      <Copy className="h-3 w-3" />
                    )}
                  </Button>
                </div>
              </div>
            )}

            {/* Drive View URL (untuk link ke Drive file) */}
            {getGoogleDriveViewUrl(item) && (
              <div className="space-y-2">
                <label className="text-xs font-semibold text-muted-foreground uppercase">
                  Drive View URL
                </label>
                <p className="text-xs text-muted-foreground mb-2">
                  Buka file di Google Drive
                </p>
                <div className="flex items-start gap-2">
                  <code className="text-xs bg-muted p-2 rounded flex-1 break-all font-mono">
                    {formatUrlForDisplay(getGoogleDriveViewUrl(item), 100)}
                  </code>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-8 w-8 p-0 flex-shrink-0"
                    onClick={() => handleCopy(getGoogleDriveViewUrl(item) || '', 'Drive View URL')}
                  >
                    {copiedField === 'Drive View URL' ? (
                      <Check className="h-3 w-3 text-green-600" />
                    ) : (
                      <Copy className="h-3 w-3" />
                    )}
                  </Button>
                </div>
                {getGoogleDriveViewUrl(item) && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 text-xs gap-1"
                    asChild
                  >
                    <a href={getGoogleDriveViewUrl(item)} target="_blank" rel="noopener noreferrer">
                      <ExternalLink className="h-3 w-3" />
                      Open in Drive
                    </a>
                  </Button>
                )}
              </div>
            )}

            {/* Drive File ID */}
            {(item as any).driveFileId && (
              <div className="space-y-2">
                <label className="text-xs font-semibold text-muted-foreground uppercase">
                  Drive File ID
                </label>
                <div className="flex items-center gap-2">
                  <code className="text-xs bg-muted p-2 rounded flex-1 break-all font-mono">
                    {formatUrlForDisplay((item as any).driveFileId, 60)}
                  </code>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-8 w-8 p-0"
                    onClick={() => handleCopy((item as any).driveFileId || '', 'Drive File ID')}
                  >
                    {copiedField === 'Drive File ID' ? (
                      <Check className="h-3 w-3 text-green-600" />
                    ) : (
                      <Copy className="h-3 w-3" />
                    )}
                  </Button>
                </div>
              </div>
            )}
          </div>

          {/* Timestamps Section */}
          <div className="border-t pt-4 space-y-3">
            <h3 className="font-semibold text-sm">Timeline</h3>

            {/* Created At */}
            {item.createdAt && (
              <div className="space-y-2">
                <label className="text-xs font-semibold text-muted-foreground uppercase">
                  Created At
                </label>
                <p className="text-xs text-muted-foreground">
                  {item.createdAt instanceof Date
                    ? item.createdAt.toLocaleString()
                    : new Date((item.createdAt as any).seconds * 1000).toLocaleString()}
                </p>
              </div>
            )}

            {/* Updated At */}
            {item.updatedAt && (
              <div className="space-y-2">
                <label className="text-xs font-semibold text-muted-foreground uppercase">
                  Last Updated
                </label>
                <p className="text-xs text-muted-foreground">
                  {item.updatedAt instanceof Date
                    ? item.updatedAt.toLocaleString()
                    : new Date((item.updatedAt as any).seconds * 1000).toLocaleString()}
                </p>
              </div>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Close
          </Button>
          <Button onClick={handleEdit}>Edit Company</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
