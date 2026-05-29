dns_records = {
  "spf-apex" = {
    name    = "@"
    type    = "TXT"
    content = "v=spf1 include:_spf.resend.com -all"
    proxied = false
  }
  "dmarc-apex" = {
    name    = "_dmarc"
    type    = "TXT"
    content = "v=DMARC1; p=reject; sp=reject; pct=100; adkim=s; aspf=s; fo=1; rua=mailto:dmarc-reports@affilite-mix.com; ruf=mailto:dmarc-forensics@affilite-mix.com"
    proxied = false
  }
}
