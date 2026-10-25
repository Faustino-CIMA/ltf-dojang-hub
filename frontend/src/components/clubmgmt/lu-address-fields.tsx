"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverAnchor, PopoverContent } from "@/components/ui/popover";
import { PopoverSelect } from "@/components/ui/popover-select";
import { lookupLuAddress, type AddressLookup } from "@/lib/clubmgmt-api";
import { applyAddressSuggestion, applyPostalLookup, splitAddressSuggestion } from "@/lib/address-suggestion";
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
  idPrefix?: string;
  showCountry?: boolean;
};

type HouseSuggestion = AddressLookup["houses"][number];

function suggestionText(row: HouseSuggestion): string {
  if (row.label.trim()) {
    return row.label.trim();
  }
  return [row.house_number, row.street, row.postal_code ? `L-${row.postal_code}` : "", row.locality]
    .filter(Boolean)
    .join(", ");
}

export function LuAddressFields({ value, onChange, idPrefix = "address", showCountry = true }: Props) {
  const t = useTranslations("ClubMgmt");
  const locale = useLocale();
  const listId = useId();
  const valueRef = useRef(value);
  useEffect(() => {
    valueRef.current = value;
  }, [value]);
  const [streets, setStreets] = useState<string[]>([]);
  const [houses, setHouses] = useState<HouseSuggestion[]>([]);
  const [localities, setLocalities] = useState<string[]>([]);
  const [streetFocused, setStreetFocused] = useState(false);

  const country = normalizeAddressCountry(value.country);
  const countryConfig = addressCountryConfig(country);
  const countryOptions = useMemo(() => {
    const listed: string[] = ADDRESS_COUNTRIES.map((row) => row.name);
    if (country && !listed.includes(country)) {
      return [country, ...listed];
    }
    return listed;
  }, [country]);

  const suggestions = useMemo(() => {
    const needle = value.street.trim().toLowerCase();
    const fromHouses = houses
      .map(suggestionText)
      .filter((label) => !needle || label.toLowerCase().includes(needle));
    const fromStreets = streets.filter((name) => !needle || name.toLowerCase().includes(needle));
    return [...new Set([...fromHouses, ...fromStreets])].slice(0, 8);
  }, [houses, streets, value.street]);

  const lookup = async (postal: string) => {
    if (!countryConfig.lookup) return;
    if (postal.replace(/\D/g, "").length !== countryConfig.postalDigits) return;
    try {
      const result = await lookupLuAddress(postal);
      setLocalities(result.localities);
      setStreets(result.streets);
      setHouses(result.houses);
      const current = valueRef.current;
      if (result.localities.length === 1) {
        onChange(
          applyPostalLookup(
            { ...current, country },
            { postal_code: result.postal_code, locality: result.localities[0] },
          ),
        );
      }
    } catch {
      setStreets([]);
      setHouses([]);
    }
  };

  const pickSuggestion = (suggestion: string) => {
    const current = valueRef.current;
    onChange(applyAddressSuggestion({ ...current, country }, suggestion));
    setStreetFocused(false);
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

  const houseNumbers = houses.filter((row) => !value.street || row.street === value.street);

  return (
    <div className="grid gap-3 md:grid-cols-2">
      {showCountry ? (
        <div className="md:col-span-2">
          <Label htmlFor={`${idPrefix}-country`}>{t("country")}</Label>
          <PopoverSelect
            className="mt-1 w-full"
            value={country}
            onValueChange={setCountry}
            ariaLabel={t("country")}
            options={countryOptions.map((name) => {
              const code = ADDRESS_COUNTRIES.find((row) => row.name === name)?.code;
              return { value: name, label: code ? nationalityLabel(code, locale) : name };
            })}
          />
        </div>
      ) : null}
      <div>
        <Label htmlFor={`${idPrefix}-postal`}>{t("postalCode")}</Label>
        <Input
          id={`${idPrefix}-postal`}
          value={value.postal_code}
          inputMode="numeric"
          maxLength={countryConfig.postalDigits}
          className="mt-1"
          placeholder={countryConfig.code ? `${countryConfig.code}-` : ""}
          onChange={(event) => {
            const postal_code = event.target.value.replace(/\D/g, "").slice(0, countryConfig.postalDigits);
            const current = valueRef.current;
            onChange({ ...current, country, postal_code });
            if (countryConfig.lookup && postal_code.length === countryConfig.postalDigits) {
              void lookup(postal_code);
            } else {
              setStreets([]);
              setHouses([]);
              setLocalities([]);
            }
          }}
        />
      </div>
      <div>
        <Label htmlFor={`${idPrefix}-locality`}>{t("locality")}</Label>
        <Input
          id={`${idPrefix}-locality`}
          className="mt-1"
          list={`${listId}-localities`}
          value={value.locality}
          onChange={(event) => onChange({ ...valueRef.current, country, locality: event.target.value })}
        />
        <datalist id={`${listId}-localities`}>
          {localities.map((item) => (
            <option key={item} value={item} />
          ))}
        </datalist>
      </div>
      <div>
        <Label htmlFor={`${idPrefix}-street`}>{t("street")}</Label>
        <Popover open={streetFocused && suggestions.length > 0}>
          <PopoverAnchor asChild>
            <Input
              id={`${idPrefix}-street`}
              className="mt-1"
              value={value.street}
              autoComplete="off"
              onFocus={() => setStreetFocused(true)}
              onBlur={() => setStreetFocused(false)}
              onChange={(event) => {
                const text = event.target.value;
                const current = { ...valueRef.current, country };
                const parsed = splitAddressSuggestion(text);
                if (parsed.postal_code || (parsed.house_number && text.includes(","))) {
                  onChange(applyAddressSuggestion(current, text));
                  return;
                }
                onChange({ ...current, street: text });
              }}
            />
          </PopoverAnchor>
          <PopoverContent
            className="max-h-64 overflow-y-auto p-1"
            onOpenAutoFocus={(event) => event.preventDefault()}
            onCloseAutoFocus={(event) => event.preventDefault()}
          >
            <ul aria-label={t("street")}>
              {suggestions.map((suggestion) => (
                <li key={suggestion}>
                  <button
                    type="button"
                    className="flex min-h-[var(--control-height)] w-full items-center rounded-[var(--radius-form)] px-3 text-left text-sm text-[var(--popover-foreground)] hover:bg-[var(--accent-soft)] hover:text-foreground"
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() => pickSuggestion(suggestion)}
                  >
                    {suggestion}
                  </button>
                </li>
              ))}
            </ul>
          </PopoverContent>
        </Popover>
      </div>
      <div>
        <Label htmlFor={`${idPrefix}-number`}>{t("houseNumber")}</Label>
        <Input
          id={`${idPrefix}-number`}
          className="mt-1"
          list={`${listId}-houses`}
          value={value.house_number}
          onChange={(event) => onChange({ ...valueRef.current, country, house_number: event.target.value })}
        />
        <datalist id={`${listId}-houses`}>
          {houseNumbers.map((row) => (
            <option key={`${row.street}-${row.house_number}-${row.postal_code}`} value={row.house_number} />
          ))}
        </datalist>
      </div>
      <div className="md:col-span-2">
        <Label htmlFor={`${idPrefix}-line2`}>{t("addressLine2")}</Label>
        <Input
          id={`${idPrefix}-line2`}
          className="mt-1"
          value={value.line2}
          placeholder={t("addressLine2Placeholder")}
          onChange={(event) => onChange({ ...valueRef.current, country, line2: event.target.value })}
        />
      </div>
    </div>
  );
}
