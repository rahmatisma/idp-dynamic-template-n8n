<?php
require __DIR__ . '/vendor/autoload.php';

$app = require __DIR__ . '/bootstrap/app.php';
$app->make('Illuminate\Contracts\Console\Kernel')->bootstrap();

use Illuminate\Support\Facades\Http;

echo "Testing connection to Python Engine...\n";
echo "URL: " . config('services.python_engine.url') . "\n\n";

try {
    $r = Http::timeout(10)->get(config('services.python_engine.url') . '/health');
    echo "Status: " . $r->status() . "\n";
    echo "Body: " . $r->body() . "\n";
} catch (\Exception $e) {
    echo "ERROR: " . $e->getMessage() . "\n";
}
