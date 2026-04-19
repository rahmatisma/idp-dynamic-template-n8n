<?php

namespace Database\Seeders;

use App\Models\User;
use Illuminate\Database\Console\Seeds\WithoutModelEvents;
use Illuminate\Database\Seeder;

class DatabaseSeeder extends Seeder
{
    use WithoutModelEvents;

    /**
     * Seed the application's database.
     */
    public function run(): void
    {
        // Create Admin User
        User::updateOrCreate(
            ['email' => 'admin@admin.com'],
            [
                'name' => 'Admin System',
                'password' => bcrypt('admin123'),
                'role' => 'admin',
                'is_approved' => true,
            ]
        );

        // Update/Create Test User
        User::updateOrCreate(
            ['email' => 'test@example.com'],
            [
                'name' => 'Test User',
                'password' => bcrypt('password'),
            ]
        );
    }
}
