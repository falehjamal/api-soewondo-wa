<?php
function apiWaNew($id, $pesan, $isGroup = false) {
    $url = 'http://localhost:3000/api/' . ($isGroup ? 'send-group' : 'send-private');
    $data = [
        'apiKey'  => 'tes123',
        $isGroup ? 'groupId' : 'number' => $id,
        'message' => $pesan
    ];
    $ch = curl_init($url);
    curl_setopt_array($ch, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_POST           => true,
        CURLOPT_HTTPHEADER     => ['Content-Type: application/json'],
        CURLOPT_POSTFIELDS     => json_encode($data)
    ]);
    $res = curl_exec($ch);
    curl_close($ch);
    return $res ?: 'Curl error: ' . curl_error($ch);
}

echo apiWaNew('6285281411550', 'Halo dari dunia nyata!');
echo apiWaNew('120363403933067028', 'Halo grup keren!', true);
