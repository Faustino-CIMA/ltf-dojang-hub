"use client";

import { useMemo, useState } from "react";
import { useLocale, useTranslations } from "next-intl";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { lookupLuAddress } from "@/lib/clubmgmt-api";
import {
  ADDRESS_COUNTRIES,
  addressCountryConfig,
  nationalityLabel,
  normalizeAddressCountry,
} from "@/lib/nationalities";

export type AddressValue = {
  postal_code: string;
  locality: string;
  street: string;
  house_number: string;
  line2: string;
  country: string;
  use_for_invoice: boolean;
};

type Props = {
  value: AddressValue;
  onChange: (next: AddressValue) => void;
};

export function LuAddressFields({ value, onChange }: Props) {
  const t = useTranslations("ClubMgmt");
  const locale = useLocale();
  const [streets, setStreets] = useState<string[]>([]);
  const [houses, setHouses] = useState<Array<{ house_number: string; street: string }>>([]);
  const [localities, setLocalities] = useState<string[]>([]);

  const country = normalizeAddressCountry(value.country);
  const countryConfig = addressCountryConfig(country);
  const countryOptions = useMemo(() => {
    const listed: string[] = ADDRESS_COUNTRIES.map((row) => row.name);
    if (country && !listed.includes(country)) {
      return [country, ...listed];
    }
    return listed;
  }, [country]);

  const lookup = async (postal: string, street = "") => {
    if (!countryConfig.lookup) return;
    if (postal.replace(/\D/g, "").length !== countryConfig.postalDigits) return;
    try {
      const result = await lookupLuAddress(postal, street);
      setLocalities(result.localities);
      setStreets(result.streets);
      setHouses(result.houses.map((row) => ({ house_number: row.house_number, street: row.street })));
      if (result.localities.length === 1 && !value.locality) {
        onChange({ ...value, postal_code: result.postal_code, locality: result.localities[0], country });
      }
    } catch {
      setStreets([]);
      setHouses([]);
    }
  };

  const setCountry = (nextCountry: string) => {
    const next = normalizeAddressCountry(nextCountry);
    const nextConfig = addressCountryConfig(next);
    setLocalities([]);
    setStreets([]);
    setHouses([]);
    onChange({
      ...value,
      country: next,
      postal_code: value.postal_code.replace(/\D/g, "").slice(0, nextConfig.postalDigits),
    });
  };

  return (
    <div className="grid gap-3 md:grid-cols-2">
      <div className="md:col-span-2">
        <Label>{t("country")}</Label>
        <div className="mt-1">
          <Select value={country} onValueChange={setCountry} modal={false}>
            <SelectTrigger className="w-full">
              <SelectValue placeholder={t("country")} />
            </SelectTrigger>
            <SelectContent position="popper">
              {countryOptions.map((name) => {
                const code = ADDRESS_COUNTRIES.find((row) => row.name === name)?.code;
                return (
                  <SelectItem key={name} value={name}>
                    {code ? nationalityLabel(code, locale) : name}
                  </SelectItem>
                );
              })}
            </SelectContent>
          </Select>
        </div>
      </div>
      <div>
        <Label>{t("postalCode")}</Label>
        <Input
          value={value.postal_code}
          inputMode="numeric"
          maxLength={countryConfig.postalDigits}
          className="mt-1"
          placeholder={countryConfig.code ? `${countryConfig.code}-` : ""}
          onChange={(event) => {
            const postal_code = event.target.value.replace(/\D/g, "").slice(0, countryConfig.postalDigits);
            onChange({ ...value, country, postal_code });
            if (countryConfig.lookup && postal_code.length === countryConfig.postalDigits) {
              void lookup(postal_code);
            }
          }}
        />
      </div>
      <div>
        <Label>{t("locality")}</Label>
        <Input
          className="mt-1"
          list="club-address-localities"
          value={value.locality}
          onChange={(event) => onChange({ ...value, country, locality: event.target.value })}
        />
        <datalist id="club-address-localities">
          {localities.map((item) => (
            <option key={item} value={item} />
          ))}
        </datalist>
      </div>
      <div>
        <Label>{t("street")}</Label>
        <Input
          className="mt-1"
          list="club-address-streets"
          value={value.street}
          onChange={(event) => {
            onChange({ ...value, country, street: event.target.value });
            if (countryConfig.lookup && value.postal_code.length === countryConfig.postalDigits) {
              void lookup(value.postal_code, event.target.value);
            }
          }}
        />
        <datalist id="club-address-streets">
          {streets.map((item) => (
            <option key={item} value={item} />
          ))}
        </datalist>
      </div>
      <div>
        <Label>{t("houseNumber")}</Label>
        <Input
          className="mt-1"
          list="club-address-houses"
          value={value.house_number}
          onChange={(event) => onChange({ ...value, country, house_number: event.target.value })}
        />
        <datalist id="club-address-houses">
          {houses
            .filter((row) => !value.street || row.street === value.street)
            .map((row) => (
              <option key={`${row.street}-${row.house_number}`} value={row.house_number} />
            ))}
        </datalist>
      </div>
      <div className="md:col-span-2">
        <Label>{t("addressLine2")}</Label>
        <Input
          className="mt-1"
          value={value.line2}
          placeholder={t("addressLine2Placeholder")}
          onChange={(event) => onChange({ ...value, country, line2: event.target.value })}
        />
      </div>
    </div>
  );
}
