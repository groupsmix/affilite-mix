"use client";

import { useEffect } from "react";
import "vanilla-cookieconsent/dist/cookieconsent.css";
import * as CookieConsent from "vanilla-cookieconsent";

interface CookieConsentCmpProps {
  language?: string;
  privacyPolicyUrl?: string;
}

/**
 * CMP (Consent Management Platform) wrapper around vanilla-cookieconsent (MIT).
 * Replaces the homemade cookie banner with a TCF v2.2-ready consent manager
 * required by ad networks like Mediavine/Raptive.
 */
export default function CookieConsentCmp({
  language = "en",
  privacyPolicyUrl = "/privacy",
}: CookieConsentCmpProps) {
  useEffect(() => {
    void CookieConsent.run({
      guiOptions: {
        consentModal: {
          layout: "box inline",
          position: "bottom left",
        },
        preferencesModal: {
          layout: "box",
        },
      },

      categories: {
        necessary: {
          enabled: true,
          readOnly: true,
        },
        analytics: {
          enabled: false,
          autoClear: {
            cookies: [{ name: /^_ga/ }, { name: "_gid" }],
          },
        },
        affiliate: {
          enabled: false,
        },
        advertising: {
          enabled: false,
          autoClear: {
            cookies: [{ name: /^_gcl/ }],
          },
        },
      },

      language: {
        default: language === "ar" ? "ar" : "en",
        translations: {
          en: {
            consentModal: {
              title: "We value your privacy",
              description:
                "We use essential cookies to make this site work. With your consent, we also use analytics and affiliate cookies to improve your experience and track conversions. You can manage your preferences at any time.",
              acceptAllBtn: "Accept All",
              acceptNecessaryBtn: "Reject Non-Essential",
              showPreferencesBtn: "Manage Preferences",
            },
            preferencesModal: {
              title: "Cookie Preferences",
              acceptAllBtn: "Accept All",
              acceptNecessaryBtn: "Reject Non-Essential",
              savePreferencesBtn: "Save Preferences",
              sections: [
                {
                  title: "Essential Cookies",
                  description:
                    "These cookies are necessary for the website to function and cannot be switched off. They include session authentication, CSRF protection, and site selection.",
                  linkedCategory: "necessary",
                  cookieTable: {
                    headers: { name: "Cookie", purpose: "Purpose", type: "Type" },
                    body: [
                      {
                        name: "nh-cookie-consent",
                        purpose: "Stores your cookie consent preference",
                        type: "Essential",
                      },
                      {
                        name: "nh_active_site",
                        purpose: "Remembers your active site selection",
                        type: "Essential",
                      },
                      {
                        name: "nh_admin_token",
                        purpose: "Admin session authentication (JWT)",
                        type: "Essential",
                      },
                      {
                        name: "nh_csrf",
                        purpose: "CSRF protection token",
                        type: "Essential",
                      },
                    ],
                  },
                },
                {
                  title: "Analytics Cookies",
                  description:
                    "These cookies help us understand how visitors interact with our content, helping us improve our articles and reviews.",
                  linkedCategory: "analytics",
                },
                {
                  title: "Affiliate Cookies",
                  description:
                    "These cookies track affiliate link clicks for conversion attribution, which supports the free content on this site.",
                  linkedCategory: "affiliate",
                },
                {
                  title: "Advertising Cookies",
                  description:
                    "These cookies are used by our advertising partners to show you relevant ads based on your interests.",
                  linkedCategory: "advertising",
                },
                {
                  title: "More Information",
                  description: `For more details about how we use cookies, please visit our <a href="${privacyPolicyUrl}">Privacy Policy</a>.`,
                },
              ],
            },
          },
          ar: {
            consentModal: {
              title: "نحن نقدر خصوصيتك",
              description:
                "نستخدم ملفات تعريف الارتباط الأساسية لتشغيل هذا الموقع. بموافقتك، نستخدم أيضًا ملفات تعريف الارتباط التحليلية لفهم كيفية تفاعلك مع المحتوى وملفات تعريف الارتباط التابعة لتتبع التحويلات.",
              acceptAllBtn: "قبول الكل",
              acceptNecessaryBtn: "رفض غير الأساسية",
              showPreferencesBtn: "إدارة التفضيلات",
            },
            preferencesModal: {
              title: "تفضيلات ملفات تعريف الارتباط",
              acceptAllBtn: "قبول الكل",
              acceptNecessaryBtn: "رفض غير الأساسية",
              savePreferencesBtn: "حفظ التفضيلات",
              sections: [
                {
                  title: "ملفات تعريف الارتباط الأساسية",
                  description: "هذه ملفات تعريف الارتباط ضرورية لعمل الموقع ولا يمكن إيقافها.",
                  linkedCategory: "necessary",
                },
                {
                  title: "ملفات تعريف الارتباط التحليلية",
                  description: "تساعدنا هذه الملفات على فهم كيفية تفاعل الزوار مع المحتوى.",
                  linkedCategory: "analytics",
                },
                {
                  title: "ملفات تعريف الارتباط التابعة",
                  description: "تتبع نقرات روابط الشركات التابعة لإسناد التحويل.",
                  linkedCategory: "affiliate",
                },
                {
                  title: "ملفات تعريف الارتباط الإعلانية",
                  description: "تُستخدم لعرض إعلانات ذات صلة باهتماماتك.",
                  linkedCategory: "advertising",
                },
                {
                  title: "مزيد من المعلومات",
                  description: `لمزيد من التفاصيل، يرجى زيارة <a href="${privacyPolicyUrl}">سياسة الخصوصية</a>.`,
                },
              ],
            },
          },
        },
      },

      onConsent: () => {
        const accepted = CookieConsent.acceptedCategory("affiliate");
        window.dispatchEvent(new CustomEvent("cookieConsent", { detail: { accepted } }));
      },

      onChange: () => {
        const accepted = CookieConsent.acceptedCategory("affiliate");
        window.dispatchEvent(new CustomEvent("cookieConsent", { detail: { accepted } }));
      },
    });
  }, [language, privacyPolicyUrl]);

  return null;
}
