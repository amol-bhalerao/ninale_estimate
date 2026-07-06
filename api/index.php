<?php

declare(strict_types=1);

header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Headers: Content-Type');
header('Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS');
header('Content-Type: application/json');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    exit;
}

if (file_exists(__DIR__ . '/config.php')) {
    require __DIR__ . '/config.php';
}

function configValue(string $key, string $fallback): string
{
    if (defined($key)) {
        return (string) constant($key);
    }
    $value = getenv($key);
    return $value === false || $value === '' ? $fallback : $value;
}

function respond($payload, int $status = 200): void
{
    http_response_code($status);
    echo json_encode($payload, JSON_PRETTY_PRINT);
    exit;
}

function input(): array
{
    $raw = file_get_contents('php://input');
    if ($raw === false || trim($raw) === '') {
        return [];
    }
    $decoded = json_decode($raw, true);
    return is_array($decoded) ? $decoded : [];
}

function pdo(): PDO
{
    static $pdo = null;
    if ($pdo instanceof PDO) {
        return $pdo;
    }

    $host = configValue('DB_HOST', '127.0.0.1');
    $port = configValue('DB_PORT', '3306');
    $name = configValue('DB_NAME', 'ninale_estimate');
    $user = configValue('DB_USER', 'root');
    $pass = configValue('DB_PASS', '');
    $serverDsn = 'mysql:host=' . $host . ';port=' . $port . ';charset=utf8mb4';
    $server = new PDO($serverDsn, $user, $pass, [
        PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
    ]);
    $server->exec('CREATE DATABASE IF NOT EXISTS `' . $name . '` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci');

    $pdo = new PDO($serverDsn . ';dbname=' . $name, $user, $pass, [
        PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
    ]);
    migrate($pdo);
    return $pdo;
}

function migrate(PDO $pdo): void
{
    $pdo->exec("
        CREATE TABLE IF NOT EXISTS templates (
            id INT AUTO_INCREMENT PRIMARY KEY,
            name VARCHAR(180) NOT NULL,
            work_type VARCHAR(80) NOT NULL,
            description TEXT NULL,
            payload JSON NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    ");
    $pdo->exec("
        CREATE TABLE IF NOT EXISTS projects (
            id INT AUTO_INCREMENT PRIMARY KEY,
            name VARCHAR(180) NOT NULL,
            work_type VARCHAR(80) NOT NULL,
            template_id INT NULL,
            payload JSON NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    ");

    seedTemplates($pdo);
    seedProjects($pdo);
}

function seedTemplates(PDO $pdo): void
{
    $pdo->exec("DELETE FROM templates WHERE name IN ('Empty Bridge Template', 'Road Work Empty Template', 'Kolhapuri Bandhara Empty Template', 'Building Empty Template')");

    $templates = [
        [
            'name' => 'Bridge Estimate - K1 K2 K3 Detailed',
            'work_type' => 'Bridge',
            'description' => '30-page style bridge estimate inspired by the provided sample: cover, K calculations, abstract, lead statement, rate analysis, and lead charge pages.',
            'payload' => bridgeTemplate(),
        ],
        [
            'name' => 'Bridge Minor Repair Template',
            'work_type' => 'Bridge',
            'description' => 'Production-ready minor bridge repair template with concrete, reinforcement, bearings, railing, approach and signage mock quantities.',
            'payload' => workTemplate('Bridge', 'Minor Bridge Repair at Village Road Crossing', 'Deck slab repair, railing, approach and protection works', 9200000, ['RCC jacketing', 'HYSD reinforcement', 'Elastomeric bearings', 'Approach WMM', 'Bituminous wearing coat']),
        ],
        [
            'name' => 'Road Work Flexible Pavement Template',
            'work_type' => 'Road',
            'description' => 'Road estimate with earthwork, GSB, WMM, DBM, BC, tack coat, seal coat, sign boards and road furniture.',
            'payload' => workTemplate('Road', 'Construction of Flexible Pavement Road', 'Two lane approach road with bituminous surface', 5400000, ['Earthwork excavation', 'Granular sub-base', 'Wet mix macadam', 'Dense bituminous macadam', 'Bituminous concrete', 'Road markings']),
        ],
        [
            'name' => 'KT Weir / Kolhapuri Bandhara Template',
            'work_type' => 'Kolhapuri Bandhara',
            'description' => 'Hydraulic structure estimate with excavation, cutoff trench, masonry, RCC piers, gates, pitching and approach works.',
            'payload' => workTemplate('Kolhapuri Bandhara', 'Construction of Kolhapuri Type Bandhara', 'Storage weir with gated bays and river training works', 12800000, ['Cutoff excavation', 'M15 foundation concrete', 'UCR masonry', 'RCC piers', 'Needle gates', 'Stone pitching']),
        ],
        [
            'name' => 'Building RCC Frame Template',
            'work_type' => 'Building',
            'description' => 'Building estimate with excavation, PCC, RCC frame, masonry, plaster, flooring, waterproofing, painting and services.',
            'payload' => workTemplate('Building', 'Construction of Administrative Building', 'Ground plus one RCC framed building', 7600000, ['Foundation excavation', 'PCC bed concrete', 'RCC columns and beams', 'Brick masonry', 'Internal plaster', 'Vitrified flooring', 'Electrical conduits']),
        ],
        [
            'name' => 'RCC Box Culvert Template',
            'work_type' => 'Culvert',
            'description' => 'Box culvert estimate with diversion, excavation, PCC, RCC barrel, wing walls, apron, pitching and approach reinstatement.',
            'payload' => workTemplate('Culvert', 'Construction of RCC Box Culvert', 'Single cell culvert with wing walls and approach restoration', 4300000, ['Traffic diversion', 'Foundation excavation', 'PCC levelling course', 'RCC barrel slab', 'RCC wing walls', 'Apron concrete', 'Stone pitching', 'Approach road restoration']),
        ],
        [
            'name' => 'RCC Box Bridge Design Estimate - Tawarajkheda',
            'work_type' => 'Bridge Design',
            'description' => 'Design-estimate template with hydraulic data, linear waterway, gradient, cross-section, discharge and schematic drawing sheets inspired by the Tawarajkheda reference.',
            'payload' => designBridgeTemplate(),
        ],
        [
            'name' => 'Retaining Wall Protection Template',
            'work_type' => 'Retaining Wall',
            'description' => 'Protection estimate with excavation, PCC, RCC retaining wall, weep holes, filter media, backfilling and drainage.',
            'payload' => workTemplate('Retaining Wall', 'Construction of RCC Retaining Wall', 'Hill road protection and drainage works', 6100000, ['Excavation in foundation', 'PCC M10 bedding', 'RCC stem and footing', 'Weep holes', 'Filter media', 'Granular backfill', 'Catch water drain']),
        ],
        [
            'name' => 'Irrigation Canal Lining Template',
            'work_type' => 'Canal',
            'description' => 'Canal estimate with excavation dressing, bed lining, side lining, joints, curing, transitions and inspection path.',
            'payload' => workTemplate('Canal', 'Canal Bed and Side Lining Work', 'Mechanised lining and canal improvement estimate', 8400000, ['Canal section dressing', 'Bed concrete lining', 'Side concrete lining', 'Construction joints', 'Expansion joints', 'Curing compound', 'Inspection path murum']),
        ],
        [
            'name' => 'Water Tank ESR Template',
            'work_type' => 'Water Supply',
            'description' => 'Elevated service reservoir estimate with foundation, staging, container, inlet outlet, staircase, waterproofing and painting.',
            'payload' => workTemplate('Water Supply', 'Construction of Elevated Service Reservoir', 'RCC ESR with staging and appurtenant works', 9900000, ['Pile/open foundation', 'RCC staging columns', 'RCC container wall', 'Dome slab', 'Inlet outlet pipe work', 'MS staircase', 'Waterproofing', 'External painting']),
        ],
    ];

    $select = $pdo->prepare('SELECT id FROM templates WHERE name = ? LIMIT 1');
    $insert = $pdo->prepare('INSERT INTO templates (name, work_type, description, payload) VALUES (?, ?, ?, ?)');
    $update = $pdo->prepare('UPDATE templates SET work_type = ?, description = ?, payload = ? WHERE name = ?');
    foreach ($templates as $template) {
        $payload = json_encode($template['payload']);
        $select->execute([$template['name']]);
        if ($select->fetch()) {
            $update->execute([$template['work_type'], $template['description'], $payload, $template['name']]);
        } else {
            $insert->execute([$template['name'], $template['work_type'], $template['description'], $payload]);
        }
    }
}

function workTemplate(string $workType, string $title, string $subtitle, float $baseAmount, array $labels): array
{
    $items = [];
    foreach ($labels as $index => $label) {
        $itemNo = $index + 1;
        $rate = round(($baseAmount / max(1, count($labels))) / (80 + ($itemNo * 35)), 2);
        $quantity = 80 + ($itemNo * 35);
        $cementRate = $itemNo % 2 === 0 ? round($rate * 0.14, 2) : 0;
        $royaltyRate = round($rate * 0.05, 2);
        $machineryRate = round($rate * 0.09, 2);
        $labourRate = round($rate * 0.18, 2);
        $polRate = round($rate * 0.04, 2);
        $items[] = [
            'itemNo' => $itemNo,
            'description' => $label . ' including all materials, labour, tools, plants, leads, lifts, finishing, curing, testing and complete execution as directed by Engineer in charge.',
            'rate' => $rate,
            'unit' => $itemNo % 3 === 0 ? 'Sqm' : ($itemNo % 2 === 0 ? 'Cum' : 'Rmt'),
            'quantity' => $quantity,
            'cementRate' => $cementRate,
            'royaltyRate' => $royaltyRate,
            'machineryRate' => $machineryRate,
            'labourRate' => $labourRate,
            'polRate' => $polRate,
            'materialRate' => max(0, $rate - $cementRate - $royaltyRate - $machineryRate - $labourRate - $polRate),
            'analysis' => [
                ['particular' => 'Basic rate as per latest applicable CSR / SSR', 'amount' => round($rate * 0.82, 2)],
                ['particular' => 'Lead, lift, loading, unloading and material handling', 'amount' => round($rate * 0.10, 2)],
                ['particular' => 'Quality control, finishing and incidental charges', 'amount' => round($rate * 0.04, 2)],
                ['particular' => 'Rounded rate adopted', 'amount' => $rate],
            ],
        ];
    }

    return [
        'meta' => [
            'workType' => $workType,
            'title' => $title,
            'subtitle' => $subtitle,
            'division' => 'Hisoft Public Works Division',
            'subdivision' => 'Estimate Maker Sub Division',
            'preparedBy' => 'Executive Engineer',
        ],
        'adjustments' => defaultAdjustments(),
        'leadStatement' => [
            ['material' => 'Cement', 'distanceKm' => 18, 'source' => 'Approved supplier', 'leadCharge' => 214.35, 'unit' => 'Bag', 'machinery' => 2.42, 'pol' => 8.62, 'reference' => 'Mock lead schedule'],
            ['material' => 'Steel', 'distanceKm' => 22, 'source' => 'District store', 'leadCharge' => 238.75, 'unit' => 'M.T.', 'machinery' => 48.60, 'pol' => 182.40, 'reference' => 'Mock lead schedule'],
            ['material' => 'Sand / aggregate', 'distanceKm' => 14, 'source' => 'Approved quarry', 'leadCharge' => 362.20, 'unit' => 'Cum', 'machinery' => 88.40, 'pol' => 228.50, 'reference' => 'Mock lead schedule'],
        ],
        'leadCharges' => [
            ['leadKm' => 1, 'rubble' => 135.88, 'sandMetal' => 28.91, 'steel' => 23.63, 'cement' => 13.59, 'murum' => 22.65],
            ['leadKm' => 5, 'rubble' => 520.67, 'sandMetal' => 110.78, 'steel' => 90.55, 'cement' => 52.07, 'murum' => 86.78],
            ['leadKm' => 10, 'rubble' => 982.45, 'sandMetal' => 212.80, 'steel' => 174.15, 'cement' => 99.60, 'murum' => 168.44],
            ['leadKm' => 20, 'rubble' => 1915.30, 'sandMetal' => 426.10, 'steel' => 346.85, 'cement' => 198.30, 'murum' => 337.20],
        ],
        'items' => $items,
    ];
}

function designBridgeTemplate(): array
{
    $payload = workTemplate(
        'Bridge Design',
        'Improvement to SH-211 to Tawarajkheda Kond Padoli Borkhanda Road',
        'RCC box cell bridge design estimate at Tawarajkheda, Taluka Dharashiv',
        6800000,
        ['Site clearance and traffic diversion', 'Excavation for RCC box foundation', 'PCC bedding below raft', 'RCC M25 raft slab and box barrel', 'RCC cutoff and toe wall', 'U/S and D/S apron concrete', 'Stone pitching and protection work', 'Approach road reinstatement']
    );

    $payload['meta'] = [
        'workType' => 'Bridge Design',
        'title' => 'RCC Box Cell Bridge at Tawarajkheda',
        'subtitle' => 'Improvement to MDR-34, Km 3/00 to 21/00, Taluka Dharashiv',
        'division' => 'Public Works Division, Dharashiv',
        'subdivision' => 'Public Works Sub Division, Dharashiv',
        'preparedBy' => 'Executive Engineer',
    ];

    $payload['design'] = [
        'cover' => [
            'department' => 'Government of Maharashtra',
            'region' => 'Public Works Region, Chhatrapati Sambhajinagar',
            'circle' => 'Public Works Circle, Dharashiv',
            'division' => 'Public Works Division, Dharashiv',
            'workName' => 'Improvement to SH-211 to Tawarajkheda Kond Padoli Borkhanda Road to SH-238 MDR-34',
            'location' => 'At Tawarajkheda, Taluka Dharashiv, District Dharashiv',
        ],
        'data' => [
            ['Catchment Area', '0.21 Sq.mile / 0.55 Sq.Km.'],
            ['Location of Site Crossing', 'At proposed site of crossing'],
            ['Bed Width', '6.00 m'],
            ['Bank Width', '18.00 m'],
            ['Angle of Skew', '0.00 degree'],
            ['Hydraulic Gradient', '0.0172'],
            ['Rugosity Coefficient', '0.025'],
            ['HFL', '703.30 m'],
            ['LBL', '702.00 m'],
            ['Flood Discharge', '11.73 Cumecs'],
        ],
        'waterway' => [
            ['Flood Depth', 'HFL - LBL = 703.30 - 702.00 = 1.30 m'],
            ['Average Velocity', '3.87 m/sec'],
            ['Linear Waterway', '11.73 / (3.87 x 1.30) = 2.333 m'],
            ['Adopted Waterway', '3.00 m'],
            ['Proposed Opening', '2 span of 2.00 m c/c RCC box cell bridge'],
        ],
        'gradient' => [
            ['0', '707.590', '-', '-', '-'],
            ['15', '707.120', '15.00', '0.470', '0.031'],
            ['60', '706.970', '45.00', '0.150', '0.003'],
            ['120', '706.522', '30.00', '0.307', '0.010'],
            ['210', '704.552', '30.00', '0.498', '0.017'],
            ['330', '702.690', '30.00', '0.897', '0.030'],
            ['420', '701.370', '40.00', '0.440', '0.011'],
        ],
        'crossSection' => [
            ['31', '703.470', '703.30', '0.00', 'Comp I'],
            ['32', '702.880', '703.30', '0.42', 'Comp I'],
            ['33', '702.750', '703.30', '0.55', 'Comp II'],
            ['34', '702.180', '703.30', '1.12', 'Comp II'],
            ['35', '702.000', '703.30', '1.30', 'Comp II'],
            ['37', '702.420', '703.30', '0.88', 'Comp III'],
            ['39', '702.892', '703.30', '0.41', 'Comp III'],
        ],
        'compartmentI' => [
            ['31', '703.47', '703.30', '0.00', '0.000'],
            ['32', '702.88', '703.30', '0.42', '0.210'],
            ['33', '702.75', '703.30', '0.55', '0.485'],
            ['Mean / Total', '703.03', '-', '0.32', '0.695'],
        ],
        'compartmentII' => [
            ['33', '702.75', '703.30', '0.55', '0.550'],
            ['34', '702.18', '703.30', '1.12', '0.830'],
            ['35', '702.00', '703.30', '1.30', '1.210'],
            ['36', '702.23', '703.30', '1.07', '1.180'],
            ['37', '702.42', '703.30', '0.88', '0.970'],
            ['Total', '702.32', '-', '0.98', '4.200'],
        ],
        'compartmentIII' => [
            ['37', '702.42', '703.30', '0.88', '0.810'],
            ['38', '702.56', '703.30', '0.74', '0.810'],
            ['39', '702.89', '703.30', '0.41', '0.580'],
            ['40', '702.95', '703.30', '0.35', '0.380'],
            ['41', '703.12', '703.30', '0.18', '0.180'],
            ['Total', '702.88', '-', '0.51', '2.110'],
        ],
        'discharge' => [
            ['Compartment I', '2.699', '3.883', '0.695'],
            ['Compartment II', '20.911', '4.973', '4.20'],
            ['Compartment III', '5.800', '2.750', '2.11'],
            ['Total', '29.410', '3.869 avg.', '7.009'],
        ],
        'drawingNotes' => [
            'RCC box cell bridge clear opening 2.0 m x 2.0 m.',
            '300 mm thick RCC M25 raft slab with cutoff wall, toe wall, upstream and downstream apron.',
            'RTL RL 704.65, HFL 703.30, soffit RL 704.00 as per reference drawing.',
            'Schematic drawing is generated for report preview; use CAD drawing for final construction issue.',
        ],
    ];

    return $payload;
}

function seedProjects(PDO $pdo): void
{
    $projects = [
        ['name' => 'Demo Bridge - Canal Crossing Estimate', 'work_type' => 'Bridge', 'payload' => bridgeTemplate()],
        ['name' => 'Demo Road - Flexible Pavement Estimate', 'work_type' => 'Road', 'payload' => workTemplate('Road', 'Demo Road - Flexible Pavement Estimate', 'Village road with WMM, DBM and BC layers', 5400000, ['Earthwork excavation', 'Granular sub-base', 'Wet mix macadam', 'Dense bituminous macadam', 'Bituminous concrete', 'Road markings'])],
        ['name' => 'Demo Bandhara - KT Weir Estimate', 'work_type' => 'Kolhapuri Bandhara', 'payload' => workTemplate('Kolhapuri Bandhara', 'Demo Bandhara - KT Weir Estimate', 'Gated storage weir with river training works', 12800000, ['Cutoff excavation', 'M15 foundation concrete', 'UCR masonry', 'RCC piers', 'Needle gates', 'Stone pitching'])],
    ];

    $select = $pdo->prepare('SELECT id FROM projects WHERE name = ? LIMIT 1');
    $insert = $pdo->prepare('INSERT INTO projects (name, work_type, template_id, payload) VALUES (?, ?, NULL, ?)');
    foreach ($projects as $project) {
        $select->execute([$project['name']]);
        if (!$select->fetch()) {
            $insert->execute([$project['name'], $project['work_type'], json_encode($project['payload'])]);
        }
    }
}

function emptyTemplate(string $workType): array
{
    return [
        'meta' => [
            'workType' => $workType,
            'title' => $workType . ' Estimate',
            'subtitle' => '',
            'division' => '',
            'subdivision' => '',
            'preparedBy' => '',
        ],
        'adjustments' => defaultAdjustments(),
        'items' => [],
        'leadStatement' => [],
        'leadCharges' => [],
    ];
}

function defaultAdjustments(): array
{
    return [
        'gstPercent' => 18,
        'royaltyPercent' => 10.28,
        'cementRatePerMt' => 0,
        'steelRatePerMt' => 0,
        'labourComponentPercent' => 33.24,
        'materialComponentPercent' => 53.72,
        'fuelComponentPercent' => 13.04,
    ];
}

function bridgeTemplate(): array
{
    return [
        'meta' => [
            'workType' => 'Bridge',
            'title' => 'Construction of Bridge at Ch. 21.250 km',
            'subtitle' => '(Vihamandwa-Indegaon-Hingani) of Paithan Left Bank Canal',
            'division' => 'Jayakwadi Irrigation Division (N), Paithan',
            'subdivision' => 'Jayakwadi Irrigation Sub-Division No-3, Tirthpuri',
            'preparedBy' => 'Executive Engineer',
        ],
        'adjustments' => defaultAdjustments(),
        'leadStatement' => [
            ['material' => 'Cement', 'distanceKm' => 30, 'source' => 'Paithan', 'leadCharge' => 255.23, 'unit' => 'Bag', 'machinery' => 2.66, 'pol' => 10.10, 'reference' => 'WRD SSR Pg. 19'],
            ['material' => 'Steel', 'distanceKm' => 30, 'source' => 'Paithan', 'leadCharge' => 255.23, 'unit' => 'M.T.', 'machinery' => 53.28, 'pol' => 201.95, 'reference' => 'WRD SSR Pg. 19'],
            ['material' => 'Sand / Metal below 40mm', 'distanceKm' => 12, 'source' => 'Approved quarry', 'leadCharge' => 385.07, 'unit' => 'Cum', 'machinery' => 92.59, 'pol' => 240.31, 'reference' => 'Lead schedule'],
            ['material' => 'Rubble', 'distanceKm' => 15, 'source' => 'Approved quarry', 'leadCharge' => 471.10, 'unit' => 'Cum', 'machinery' => 130.36, 'pol' => 478.94, 'reference' => 'Lead schedule'],
            ['material' => 'Murum / Metal above 40mm', 'distanceKm' => 10, 'source' => 'Borrow area', 'leadCharge' => 343.78, 'unit' => 'Cum', 'machinery' => 74.52, 'pol' => 182.64, 'reference' => 'Lead schedule'],
        ],
        'leadCharges' => [
            ['leadKm' => 1, 'rubble' => 135.88, 'sandMetal' => 28.91, 'steel' => 23.63, 'cement' => 13.59, 'murum' => 22.65],
            ['leadKm' => 2, 'rubble' => 234.17, 'sandMetal' => 49.82, 'steel' => 40.73, 'cement' => 23.42, 'murum' => 39.03],
            ['leadKm' => 3, 'rubble' => 331.60, 'sandMetal' => 70.55, 'steel' => 57.67, 'cement' => 33.16, 'murum' => 55.27],
            ['leadKm' => 4, 'rubble' => 427.04, 'sandMetal' => 90.86, 'steel' => 74.27, 'cement' => 42.70, 'murum' => 71.17],
            ['leadKm' => 5, 'rubble' => 520.67, 'sandMetal' => 110.78, 'steel' => 90.55, 'cement' => 52.07, 'murum' => 86.78],
            ['leadKm' => 10, 'rubble' => 982.45, 'sandMetal' => 212.80, 'steel' => 174.15, 'cement' => 99.60, 'murum' => 168.44],
            ['leadKm' => 15, 'rubble' => 1451.22, 'sandMetal' => 315.02, 'steel' => 255.23, 'cement' => 146.14, 'murum' => 251.37],
            ['leadKm' => 30, 'rubble' => 2820.00, 'sandMetal' => 617.40, 'steel' => 510.46, 'cement' => 292.28, 'murum' => 501.10],
        ],
        'items' => bridgeItems(),
    ];
}

function bridgeItems(): array
{
    $desc = [
        1 => 'Dismantling R.C.C. works and removing the stuff to a distance of 15 m and all lifts including stacking etc. complete as directed.',
        2 => 'Excavation in all kinds of soil including boulders up to 0.6 m diameter for canal and placing excavated stuff in dump area or formation work with lead up to 1 km and all lifts.',
        3 => 'Providing casing embankment using selected pervious material from approved borrow areas in layers including collection, spreading, watering and compaction.',
        4 => 'Conveying materials obtained from excavation and useful for embankment with all leads and lifts as directed.',
        5 => 'Dewatering by pumping out water collected with diesel or electrical pumps including sump and ancillary operations.',
        6 => 'Providing and laying plain cement concrete M15 for foundations and levelling course complete.',
        7 => 'Providing and laying in situ / ready mix controlled grade M25 concrete for RCC works excluding reinforcement.',
        8 => 'Providing and fixing HYSD reinforcement including cutting, bending, binding, placing and supporting complete.',
        9 => 'Providing and laying in situ / ready mix M30 controlled reinforced cement concrete for raft slab including formwork and curing.',
        10 => 'Providing and laying in situ cement concrete M30 for trough of aqueduct with batching plant and transit mixer including centering and scaffolding.',
        11 => 'Providing and laying M30 plain cement concrete for piers, abutments, returns and wings including false joints and formwork.',
        12 => 'Providing and laying M30 RCC for deck slab and bridge components including compacting, curing and finishing.',
        13 => 'Providing and fixing elastomeric bearing pads as per drawings and specifications.',
        14 => 'Providing and laying cement concrete wearing coat M30 grade with reinforcement as per drawings.',
        15 => 'Providing expansion joints complete with sealant, filler and fixing arrangement.',
        16 => 'Providing weep holes, drainage spouts and ancillary bridge drainage works.',
        17 => 'Providing and laying rubble soling below foundation in layers including filling with rubble chips and murum.',
        18 => 'Providing and laying M15 concrete for PCC / RCC concreting requiring heavy or special type of shuttering.',
        19 => 'Providing and laying boulders apron on river bed for scour protection with boulders weighing not less than 40 kg each.',
        20 => 'Construction of RCC railing of M30 grade true to line and grade with vertical posts.',
        21 => 'Providing approach slab and transition works complete as per drawings.',
        22 => 'Providing and laying 0.90 meter thick metal mat consisting of rubble, oversized metal and normal size metal.',
        23 => 'Providing pitching / protection work with rubble and hand packing complete.',
        24 => 'Providing filter media and graded metal backing for protection works.',
        25 => 'Providing and laying in situ mechanised lining in M15 grade concrete for bed lining 10 cm thick.',
        26 => 'Providing and laying in situ mechanised lining in M15 grade concrete for side lining 10 cm thick.',
        27 => 'Supplying hard murum / kankar at the road site including conveying and stacking complete.',
        28 => 'Spreading hard murum / soft murum / gravel or kankar for side width complete.',
        29 => 'Compacting hard murum side widths with vibratory roller including watering complete.',
        30 => 'Providing and fixing cautionary / warning sign boards with retro reflective sheeting and support post.',
        31 => 'Providing kilometer / information stones and painting complete.',
        32 => 'Providing R.C.C. pipe NP2 class conforming to IS 458:2003 including transportation and stacking.',
        33 => 'Laying and jointing R.C.C. pipe NP2 class in cement mortar including aligning and curing.',
        34 => 'Providing additional casing embankment for approach road using selected pervious material.',
        35 => 'Providing granular sub-base with graded material including spreading and compaction.',
        36 => 'Wet Mix Macadam: providing, laying, spreading and compacting graded stone aggregate.',
        37 => 'Dense Bituminous Macadam using crushed aggregate premixed with bituminous binder.',
        38 => 'Providing and applying tack coat on prepared bituminous surface.',
        39 => 'Bituminous Concrete using crushed aggregate and bituminous binder complete.',
        40 => 'Providing Type A liquid seal coat on bituminous surface including chips and rolling.',
    ];

    $rows = [
        [1, 487.57, 'Cum', 486.75, 4.13, 0, 0, 417.18, 0],
        [2, 112.83, 'Cum', 8561.79, 0.14, 40.00, 46.58, 13.78, 46.58],
        [3, 444.31, 'Cum', 4146.30, 0.03, 119.39, 168.10, 3.47, 168.10],
        [4, 97.34, 'Cum', 960.00, 0.00, 0.00, 76.20, 21.14, 76.20],
        [5, 76.96, 'Hours', 600.00, 0.05, 0.00, 65.52, 5.09, 65.52],
        [6, 5875.12, 'Cum', 88.45, 1662.40, 0.00, 520.38, 808.72, 0],
        [7, 9412.24, 'Cum', 310.72, 1848.62, 0.00, 713.24, 1158.45, 0],
        [8, 88968.00, 'MT', 30.64, 0.00, 0.00, 0.00, 8600.00, 0],
        [9, 7526.26, 'Cum', 161.95, 0.00, 0.00, 0.00, 6974.45, 0],
        [10, 12230.35, 'Cum', 268.46, 1926.98, 0.00, 916.92, 2203.34, 916.92],
        [11, 9525.46, 'Cum', 104.14, 0.00, 0.00, 0.00, 937.58, 0],
        [12, 10844.50, 'Cum', 66.40, 1825.78, 0.00, 640.00, 2100.00, 640.00],
        [13, 18450.00, 'Nos', 16.00, 0.00, 0.00, 0.00, 2320.00, 0],
        [14, 14640.21, 'Cum', 16.30, 2100.00, 0.00, 980.00, 1540.00, 980.00],
        [15, 6250.00, 'Rmt', 22.50, 0.00, 0.00, 0.00, 1250.00, 0],
        [16, 1180.00, 'Nos', 28.00, 0.00, 0.00, 0.00, 250.00, 0],
        [17, 1547.97, 'Cum', 168.00, 0.00, 366.00, 0.00, 506.43, 0],
        [18, 6924.35, 'Cum', 33.39, 1887.81, 10.83, 900.44, 1093.96, 900.44],
        [19, 2584.39, 'Cum', 67.10, 0.00, 138.56, 498.62, 878.00, 498.62],
        [20, 2564.30, 'Rmt', 58.20, 0.00, 0.00, 0.00, 937.58, 0],
        [21, 7250.00, 'Cum', 18.00, 1220.00, 0.00, 380.00, 940.00, 380.00],
        [22, 2064.88, 'Sqm', 91.60, 0.00, 588.88, 0.00, 937.58, 0],
        [23, 1210.00, 'Cum', 128.00, 0.00, 420.00, 0.00, 395.00, 0],
        [24, 855.00, 'Cum', 75.00, 0.00, 245.00, 0.00, 225.00, 0],
        [25, 6775.49, '/ Cum', 108.00, 1825.78, 7.10, 642.92, 717.04, 642.92],
        [26, 6946.76, '/ Cum', 238.62, 1825.78, 6.90, 642.92, 696.76, 642.92],
        [27, 800.53, 'Cum', 3672.00, 0.00, 0.00, 0.00, 937.58, 0],
        [28, 82.95, 'Cum', 3672.00, 0.00, 0.00, 0.00, 79.00, 0],
        [29, 22.05, 'Sqm', 2975.00, 0.00, 0.00, 0.00, 4.00, 0],
        [30, 20480.00, 'Nos', 4.00, 0.00, 0.00, 0.00, 3600.00, 0],
        [31, 1450.00, 'Nos', 8.00, 0.00, 0.00, 0.00, 350.00, 0],
        [32, 3261.18, 'Rmt', 100.00, 0.00, 0.00, 0.00, 0.00, 0],
        [33, 440.61, 'Rmt', 40.00, 2.41, 0.00, 0.00, 243.93, 0],
        [34, 444.31, 'Cum', 150.00, 0.03, 81.83, 82.59, 3.47, 82.59],
        [35, 1180.00, 'Cum', 210.00, 0.00, 285.00, 91.00, 165.00, 91.00],
        [36, 2045.00, 'Cum', 185.00, 0.00, 365.00, 173.46, 219.06, 173.46],
        [37, 7860.00, 'Cum', 42.00, 0.00, 2120.00, 825.00, 620.00, 825.00],
        [38, 29.66, 'Sqm', 300.00, 0.00, 0.00, 0.00, 937.58, 0],
        [39, 10450.00, 'Cum', 24.00, 0.00, 3150.00, 980.00, 850.00, 980.00],
        [40, 89.20, 'Sqm', 730.00, 0.00, 8.00, 4.20, 12.00, 4.20],
    ];

    return array_map(function ($row) use ($desc) {
        [$no, $rate, $unit, $qty, $cementRate, $royaltyRate, $machineryRate, $labourRate, $polRate] = $row;
        return [
            'itemNo' => $no,
            'description' => $desc[$no],
            'rate' => $rate,
            'unit' => $unit,
            'quantity' => $qty,
            'cementRate' => $cementRate,
            'royaltyRate' => $royaltyRate,
            'machineryRate' => $machineryRate,
            'labourRate' => $labourRate,
            'polRate' => $polRate,
            'materialRate' => max(0, $rate - $cementRate - $royaltyRate - $machineryRate - $labourRate - $polRate),
            'analysis' => [
                ['particular' => 'Basic rate as per CSR / SSR', 'amount' => round($rate * 0.86, 2)],
                ['particular' => 'Lead charges and material loading', 'amount' => round($rate * 0.09, 2)],
                ['particular' => '1% labour welfare / incidental charges', 'amount' => round($rate * 0.01, 2)],
                ['particular' => 'Rounded rate adopted', 'amount' => $rate],
            ],
        ];
    }, $rows);
}

function projectPayload(array $body, ?array $base = null): array
{
    $payload = $body['payload'] ?? $base ?? emptyTemplate($body['work_type'] ?? 'Bridge');
    if (!is_array($payload)) {
        $payload = emptyTemplate('Bridge');
    }
    return $payload;
}

try {
    $pdo = pdo();
    $path = trim((string) ($_GET['r'] ?? ''), '/');
    if ($path === '') {
        $path = trim(parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH) ?? '/', '/');
        $path = preg_replace('#^(api|backend\.php)/?#', '', $path);
    }
    $method = $_SERVER['REQUEST_METHOD'];

    if ($path === 'login' && $method === 'POST') {
        respond(['ok' => true, 'user' => ['name' => 'Estimator', 'role' => 'Admin']]);
    }

    if ($path === 'templates' && $method === 'GET') {
        $rows = $pdo->query('SELECT id, name, work_type, description, payload FROM templates ORDER BY id')->fetchAll();
        foreach ($rows as &$row) {
            $row['payload'] = json_decode($row['payload'], true);
        }
        respond($rows);
    }

    if (preg_match('#^templates/(\d+)$#', $path, $match) && $method === 'PUT') {
        $id = (int) $match[1];
        $body = input();
        $payload = $body['payload'] ?? emptyTemplate($body['work_type'] ?? 'Bridge');
        if (!is_array($payload)) {
            $payload = emptyTemplate('Bridge');
        }
        $stmt = $pdo->prepare('UPDATE templates SET name = ?, work_type = ?, description = ?, payload = ? WHERE id = ?');
        $stmt->execute([
            $body['name'] ?? $payload['meta']['title'] ?? 'Untitled Template',
            $body['work_type'] ?? $payload['meta']['workType'] ?? 'Bridge',
            $body['description'] ?? '',
            json_encode($payload),
            $id,
        ]);
        respond(['id' => $id, 'payload' => $payload]);
    }

    if (preg_match('#^templates/(\d+)$#', $path, $match) && $method === 'DELETE') {
        $stmt = $pdo->prepare('DELETE FROM templates WHERE id = ?');
        $stmt->execute([(int) $match[1]]);
        respond(['ok' => true]);
    }

    if ($path === 'projects' && $method === 'GET') {
        $rows = $pdo->query('SELECT id, name, work_type, template_id, payload, created_at, updated_at FROM projects ORDER BY updated_at DESC')->fetchAll();
        foreach ($rows as &$row) {
            $row['payload'] = json_decode($row['payload'], true);
        }
        respond($rows);
    }

    if ($path === 'projects' && $method === 'POST') {
        $body = input();
        $template = null;
        if (!empty($body['template_id'])) {
            $stmt = $pdo->prepare('SELECT payload FROM templates WHERE id = ?');
            $stmt->execute([(int) $body['template_id']]);
            $templateRow = $stmt->fetch();
            $template = $templateRow ? json_decode($templateRow['payload'], true) : null;
        }
        $payload = projectPayload($body, $template);
        if (empty($payload['items']) || !is_array($payload['items'])) {
            respond(['error' => 'Select a template or add estimate items before saving the project.'], 422);
        }
        if (!empty($body['name'])) {
            $payload['meta']['title'] = $body['name'];
        }
        $stmt = $pdo->prepare('INSERT INTO projects (name, work_type, template_id, payload) VALUES (?, ?, ?, ?)');
        $stmt->execute([
            $body['name'] ?? $payload['meta']['title'] ?? 'Untitled Project',
            $body['work_type'] ?? $payload['meta']['workType'] ?? 'Bridge',
            $body['template_id'] ?? null,
            json_encode($payload),
        ]);
        respond(['id' => (int) $pdo->lastInsertId(), 'payload' => $payload], 201);
    }

    if (preg_match('#^projects/(\d+)$#', $path, $match) && $method === 'PUT') {
        $id = (int) $match[1];
        $body = input();
        $payload = projectPayload($body);
        if (empty($payload['items']) || !is_array($payload['items'])) {
            respond(['error' => 'Add at least one estimate item before saving the project.'], 422);
        }
        $stmt = $pdo->prepare('UPDATE projects SET name = ?, work_type = ?, payload = ? WHERE id = ?');
        $stmt->execute([
            $body['name'] ?? $payload['meta']['title'] ?? 'Untitled Project',
            $body['work_type'] ?? $payload['meta']['workType'] ?? 'Bridge',
            json_encode($payload),
            $id,
        ]);
        respond(['id' => $id, 'payload' => $payload]);
    }

    if ($path === 'health') {
        respond(['ok' => true, 'database' => configValue('DB_NAME', 'ninale_estimate')]);
    }

    respond(['error' => 'Route not found', 'path' => $path], 404);
} catch (Throwable $error) {
    respond(['error' => $error->getMessage()], 500);
}
