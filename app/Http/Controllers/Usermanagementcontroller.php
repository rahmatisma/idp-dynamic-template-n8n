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
    public function index(Request $request)
    {
        $query = User::query();

        // Search
        if ($request->filled('search')) {
            $q = $request->search;
            $query->where(fn($q2) =>
                $q2->where('name', 'like', "%{$q}%")
                   ->orWhere('email', 'like', "%{$q}%")
            );
        }

        // Filter role
        if ($request->filled('role') && $request->role !== 'all') {
            $query->where('role', $request->role);
        }

        // Filter status
        if ($request->filled('status') && $request->status !== 'all') {
            $query->where('is_approved', $request->status === 'active');
        }

        $users = $query->orderByDesc('created_at')
            ->paginate(15)
            ->withQueryString()
            ->through(fn($user) => [
                'id'          => $user->id,
                'name'        => $user->name,
                'email'       => $user->email,
                'role'        => $user->role ?? 'engineer',
                'is_active'   => $user->is_approved ?? false,
                'joined_at'   => $user->created_at->format('d M Y'),
            ]);

        return Inertia::render('UserManagement', [
            'users'   => $users,
            'filters' => $request->only(['search', 'role', 'status']),
            'flash'   => session()->only(['success', 'error']),
        ]);
    }

    /**
     * Aktifkan akun user.
     */
    public function approve(User $user)
    {
        $user->update(['is_approved' => true]);
        return back()->with('success', "{$user->name} berhasil diaktifkan.");
    }

    /**
     * Nonaktifkan akun user.
     */
    public function reject(User $user)
    {
        $user->update(['is_approved' => false]);
        return back()->with('success', "{$user->name} berhasil dinonaktifkan.");
    }

    /**
     * Hapus user dari sistem.
     */
    public function destroy(User $user)
    {
        $user->delete();
        return back()->with('success', 'User berhasil dihapus dari sistem.');
    }
}