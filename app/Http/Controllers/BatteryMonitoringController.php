<?php

namespace App\Http\Controllers;

use Inertia\Inertia;

class BatteryMonitoringController extends Controller
{
    /**
     * Data dummy per site & bank — BUKAN dari tabel documents/extracted_data.
     * Semua nilai di-hardcode di sini sampai ekstraksi OCR SOH sudah divalidasi akurat.
     *
     * Threshold yang berlaku (formulir PT Lintasarta):
     *   - Voltage minimum: 12 VDC/Battery
     *   - SOH minimum: 80%
     * Status "Perlu Monitoring" hanya aktif jika KEDUANYA di bawah threshold (AND).
     */
    private function buildDummyData(): array
    {
        $months = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt'];

        return [
            'Grand Mall Bekasi' => [
                'Bank 1' => [
                    'battery_type'  => 'VRLA AGM',
                    'battery_brand' => 'Yuasa',
                    'series' => array_map(fn ($m, $i) => [
                        'month'   => $m,
                        'voltage' => round(12.8 - $i * 0.06, 2),
                        'soh'     => round(92.0 - $i * 1.5, 1),
                    ], $months, range(0, 9)),
                ],
                'Bank 2' => [
                    'battery_type'  => 'VRLA AGM',
                    'battery_brand' => 'Panasonic',
                    'series' => array_map(fn ($m, $i) => [
                        'month'   => $m,
                        'voltage' => round(12.5 - $i * 0.09, 2),
                        'soh'     => round(88.0 - $i * 2.1, 1),
                    ], $months, range(0, 9)),
                ],
                'Bank 3' => [
                    'battery_type'  => 'VRLA GEL',
                    'battery_brand' => 'CSB',
                    'series' => array_map(fn ($m, $i) => [
                        'month'   => $m,
                        'voltage' => round(12.2 - $i * 0.12, 2),
                        'soh'     => round(84.0 - $i * 2.8, 1),
                    ], $months, range(0, 9)),
                ],
            ],
            'Cikarang Trade Center' => [
                'Bank 1' => [
                    'battery_type'  => 'VRLA AGM',
                    'battery_brand' => 'GS Astra',
                    'series' => array_map(fn ($m, $i) => [
                        'month'   => $m,
                        'voltage' => round(11.9 - $i * 0.07, 2),
                        'soh'     => round(79.0 - $i * 1.8, 1),
                    ], $months, range(0, 9)),
                ],
                'Bank 2' => [
                    'battery_type'  => 'VRLA GEL',
                    'battery_brand' => 'Fiamm',
                    'series' => array_map(fn ($m, $i) => [
                        'month'   => $m,
                        'voltage' => round(12.6 - $i * 0.05, 2),
                        'soh'     => round(90.5 - $i * 1.2, 1),
                    ], $months, range(0, 9)),
                ],
                'Bank 3' => [
                    'battery_type'  => 'VRLA AGM',
                    'battery_brand' => 'Yuasa',
                    'series' => array_map(fn ($m, $i) => [
                        'month'   => $m,
                        'voltage' => round(11.8 - $i * 0.10, 2),
                        'soh'     => round(78.0 - $i * 2.3, 1),
                    ], $months, range(0, 9)),
                ],
            ],
            'Cileunyi' => [
                'Bank 1' => [
                    'battery_type'  => 'VRLA GEL',
                    'battery_brand' => 'CSB',
                    'series' => array_map(fn ($m, $i) => [
                        'month'   => $m,
                        'voltage' => round(13.0 - $i * 0.04, 2),
                        'soh'     => round(95.0 - $i * 0.9, 1),
                    ], $months, range(0, 9)),
                ],
                'Bank 2' => [
                    'battery_type'  => 'VRLA AGM',
                    'battery_brand' => 'Panasonic',
                    'series' => array_map(fn ($m, $i) => [
                        'month'   => $m,
                        'voltage' => round(12.7 - $i * 0.08, 2),
                        'soh'     => round(86.0 - $i * 1.7, 1),
                    ], $months, range(0, 9)),
                ],
                'Bank 3' => [
                    'battery_type'  => 'VRLA GEL',
                    'battery_brand' => 'GS Astra',
                    'series' => array_map(fn ($m, $i) => [
                        'month'   => $m,
                        'voltage' => round(11.7 - $i * 0.11, 2),
                        'soh'     => round(77.5 - $i * 2.0, 1),
                    ], $months, range(0, 9)),
                ],
            ],
        ];
    }

    public function index()
    {
        $allData = $this->buildDummyData();

        $sites = array_keys($allData);
        $banks = ['Bank 1', 'Bank 2', 'Bank 3'];

        // Bangun ringkasan per bank (nilai terbaru = elemen terakhir di series)
        $summary = [];
        foreach ($allData as $site => $bankData) {
            foreach ($bankData as $bank => $info) {
                $latest = end($info['series']);
                $summary[] = [
                    'site'          => $site,
                    'bank'          => $bank,
                    'battery_type'  => $info['battery_type'],
                    'battery_brand' => $info['battery_brand'],
                    'voltage'       => $latest['voltage'],
                    'soh'           => $latest['soh'],
                ];
            }
        }

        return Inertia::render('BatteryMonitoring', [
            'sites'       => $sites,
            'banks'       => $banks,
            'chartData'   => $allData,
            'summary'     => $summary,
            'isDummyData' => true,
        ]);
    }
}
