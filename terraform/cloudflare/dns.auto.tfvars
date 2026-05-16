dns_records = {
  "spf-apex" = {
    name    = "@"
    type    = "TXT"
    content = "v=spf1 include:_spf.resend.com ~all"
    proxied = false
  }
  "dmarc-apex" = {
    name    = "_dmarc"
    type    = "TXT"
    content = "v=DMARC1; p=reject; sp=reject; adkim=s; aspf=s; rua=mailto:dmarc-reports@affilite-mix.com; ruf=mailto:dmarc-forensics@affilite-mix.com"
    proxied = false
  }
}
