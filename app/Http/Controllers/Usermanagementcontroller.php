<?php

namespace App\Http\Controllers;

use App\Models\User;
use Illuminate\Http\Request;
use Inertia\Inertia;

class UserManagementController extends Controller
{
    /**
     * Daftar semua user beserta statusnya.
     */
    public function index()
    {
        $users = User::orderByDesc('created_at')
            ->paginate(15)
            ->through(fn($user) => [
                'id'         => $user->id,
                'name'       => $user->name,
                'email'      => $user->email,
                'role'       => $user->role ?? 'engineer',
                'is_active'  => $user->is_active ?? true,
                'joined_at'  => $user->created_at->format('d M Y'),
            ]);

        return Inertia::render('UserManagement', [
            'users' => $users,
        ]);
    }

    /**
     * Aktifkan akun user yang baru mendaftar.
     */
    public function approve(User $user)
    {
        $user->update(['is_active' => true]);
        return back()->with('success', "{$user->name} berhasil diaktifkan.");
    }

    /**
     * Nonaktifkan akun user.
     */
    public function reject(User $user)
    {
        $user->update(['is_active' => false]);
        return back()->with('success', "{$user->name} berhasil dinonaktifkan.");
    }

    /**
     * Hapus user dari sistem.
     */
    public function destroy(User $user)
    {
        $user->delete();
        return back()->with('success', 'User berhasil dihapus.');
    }
}