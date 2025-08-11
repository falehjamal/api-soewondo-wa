<?php
function apiWaNew($id, $pesan, $isGroup = false)
{
    $url = $isGroup 
        ? 'http://10.0.108.248:3000/api/send-group' 
        : 'http://10.0.108.248:3000/api/send-private';

    $fieldKey = $isGroup ? 'groupId' : 'number';

    $payload = [
        'apiKey' => 'tes123',
        $fieldKey => $id,
        'message' => $pesan,
    ];

    $ch = curl_init($url);

    curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
    curl_setopt($ch, CURLOPT_POST, true);
    curl_setopt($ch, CURLOPT_HTTPHEADER, [
        'Content-Type: application/json'
    ]);
    curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode($payload));

    $response = curl_exec($ch);

    if (curl_errno($ch)) {
        return 'Curl error: ' . curl_error($ch);
    }

    curl_close($ch);

    return $response;
}


// Kirim ke nomor pribadi
echo apiWaNew('6285281411550', 'Halo dari dunia nyata!');

// Kirim ke grup
echo apiWaNew('120363403933067028', 'Halo grup keren!', true);
