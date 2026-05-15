dns_records = {
  "spf-apex" = {
    name    = "@"
    type    = "TXT"
    content = "v=spf1 -all"
    proxied = false
  }
  "dmarc-apex" = {
    name    = "_dmarc"
    type    = "TXT"
    content = "v=DMARC1; p=reject; sp=reject; adkim=s; aspf=s;"
    proxied = false
  }
}
