/**
 * Utilities for Super Admin user management
 */

export interface ResetPasswordResult {
    success: boolean;
    tempPassword?: string;
    message: string;
}

export interface ToggleStatusResult {
    success: boolean;
    newStatus?: boolean;
    message: string;
}

export async function resetUserPassword(uid: string, idToken: string): Promise<ResetPasswordResult> {
    try {
        const res = await fetch(`/api/users/${uid}/reset-password`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${idToken}`,
                'Content-Type': 'application/json',
            },
        });

        if (res.status === 401) {
            return {
                success: false,
                message: 'Sesi Anda telah berakhir. Silakan login kembali.',
            };
        }

        if (!res.ok) {
            const errorData = await res.json();
            return {
                success: false,
                message: errorData.error || 'Gagal mereset password',
            };
        }

        const data = await res.json();
        return {
            success: true,
            tempPassword: data.tempPassword,
            message: data.message,
        };
    } catch (error: any) {
        return {
            success: false,
            message: error.message || 'Terjadi kesalahan saat mereset password',
        };
    }
}

export async function toggleUserStatus(uid: string, newStatus: boolean, idToken: string): Promise<ToggleStatusResult> {
    try {
        const res = await fetch(`/api/users/${uid}/toggle-status`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${idToken}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ newStatus }),
        });

        if (res.status === 401) {
            return {
                success: false,
                message: 'Sesi Anda telah berakhir. Silakan login kembali.',
            };
        }

        if (!res.ok) {
            const errorData = await res.json();
            return {
                success: false,
                message: errorData.error || 'Gagal mengubah status akun',
            };
        }

        const data = await res.json();
        return {
            success: true,
            newStatus: data.newStatus,
            message: data.message,
        };
    } catch (error: any) {
        return {
            success: false,
            message: error.message || 'Terjadi kesalahan saat mengubah status akun',
        };
    }
}

export function copyToClipboard(text: string): boolean {
    try {
        navigator.clipboard.writeText(text);
        return true;
    } catch (e) {
        return false;
    }
}
