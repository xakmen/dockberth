<?php
// Dockberth sendmail bridge: PHP's mail() shells out to a sendmail
// binary, but the base image's exim4 is configured local-only, so
// nothing ever leaves the container. Mounted over sendmail_path (see
// dockberth-mailpit.ini) when the Mailpit service is enabled, this
// forwards the raw message to the project's mailpit container via a
// minimal SMTP dialogue instead.

$raw = stream_get_contents(STDIN);
if ($raw === false || trim($raw) === "") {
    fwrite(STDERR, "dockberth-sendmail: empty message\n");
    exit(1);
}

// Normalize line endings, then split headers from body at the first
// blank line to find the envelope addresses.
$raw = str_replace(["\r\n", "\r"], "\n", $raw);
[$head] = explode("\n\n", $raw, 2) + [""];

$from = "php@dockberth.local";
$recipients = [];
foreach (explode("\n", $head) as $line) {
    if (preg_match('/^(To|Cc|Bcc):(.*)$/i', $line, $m)) {
        preg_match_all('/[^\s<>,;"\']+@[^\s<>,;"\']+/', $m[2], $found);
        foreach ($found[0] as $addr) {
            $recipients[] = $addr;
        }
    } elseif (preg_match('/^From:(.*)$/i', $line, $m)
        && preg_match('/[^\s<>,;"\']+@[^\s<>,;"\']+/', $m[1], $f)) {
        $from = $f[0];
    }
}
// `sendmail -t` semantics with a fallback recipient so nothing is lost.
if ($recipients === []) {
    $recipients = ["undisclosed-recipients@dockberth.local"];
}

$sock = @fsockopen("mailpit", 1025, $errno, $errstr, 10);
if (!$sock) {
    fwrite(STDERR, "dockberth-sendmail: cannot reach mailpit:1025 ($errstr)\n");
    exit(1);
}
$expect = function (string $prefix) use ($sock): void {
    do {
        $line = fgets($sock);
        if ($line === false) {
            fwrite(STDERR, "dockberth-sendmail: connection closed\n");
            exit(1);
        }
    } while (isset($line[3]) && $line[3] === "-"); // skip multi-line replies
    if (strncmp($line, $prefix, strlen($prefix)) !== 0) {
        fwrite(STDERR, "dockberth-sendmail: unexpected reply: $line");
        exit(1);
    }
};

$expect("220");
fwrite($sock, "HELO dockberth\r\n");
$expect("250");
fwrite($sock, "MAIL FROM:<$from>\r\n");
$expect("250");
foreach (array_unique($recipients) as $rcpt) {
    fwrite($sock, "RCPT TO:<$rcpt>\r\n");
    $expect("250");
}
fwrite($sock, "DATA\r\n");
$expect("354");
// CRLF line endings and dot-stuffing per RFC 5321.
$data = str_replace("\n", "\r\n", $raw);
$data = preg_replace('/^\./m', "..", $data);
fwrite($sock, rtrim($data, "\r\n") . "\r\n.\r\n");
$expect("250");
fwrite($sock, "QUIT\r\n");
fclose($sock);
