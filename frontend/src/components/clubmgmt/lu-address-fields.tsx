"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverAnchor, PopoverContent } from "@/components/ui/popover";
import { PopoverSelect } from "@/components/ui/popover-select";
import { lookupLuAddress, type AddressLookup } from "@/lib/clubmgmt-api";
import {
  applyAddressSuggestion,
  applyPostalLookup,
  houseNumberOptions,
  lookupStreetNames,
  splitAddressSuggestion,
} from "@/lib/address-suggestion";
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
type StreetRow = { street: string; locality: string };

export function LuAddressFields({ value, onChange, idPrefix = "address", showCountry = true }: Props) {
  const t = useTranslations("ClubMgmt");
  const locale = useLocale();
  const listId = useId();
  const valueRef = useRef(value);
  useEffect(() => {
    valueRef.current = value;
  }, [value]);
  const [streets, setStreets] = useState<string[]>([]);
  const [streetRows, setStreetRows] = useState<StreetRow[]>([]);
  const [houses, setHouses] = useState<HouseSuggestion[]>([]);
  const [streetHouses, setStreetHouses] = useState<HouseSuggestion[]>([]);
  const [streetHouseQuery, setStreetHouseQuery] = useState("");
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

  const streetNames = useMemo(() => lookupStreetNames(streets, houses), [houses, streets]);
  const knownLocalities = useMemo(() => {
    const names = new Set<string>();
    streetRows.forEach((row) => {
      const locality = row.locality.trim().toLowerCase();
      if (locality) names.add(locality);
    });
    return names;
  }, [streetRows]);
  const suggestions = useMemo(() => {
    const needle = value.street.trim().toLowerCase();
    const locality = value.locality.trim().toLowerCase();
    const matches = (name: string) => !needle || name.toLowerCase().includes(needle);
    if (streetRows.length > 0) {
      const limitToLocality = Boolean(locality) && knownLocalities.has(locality);
      const names = streetRows
        .filter((row) => !limitToLocality || row.locality.trim().toLowerCase() === locality)
        .map((row) => row.street.trim())
        .filter(matches);
      return [...new Set(names)];
    }
    return streetNames.filter(matches);
  }, [knownLocalities, streetNames, streetRows, value.locality, value.street]);

  const lookup = async (postal: string) => {
    if (!countryConfig.lookup) return;
    if (postal.replace(/\D/g, "").length !== countryConfig.postalDigits) return;
    try {
      const result = await lookupLuAddress(postal);
      setLocalities(result.localities);
      setStreets(result.streets);
      setStreetRows(result.street_rows ?? []);
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
      setStreetRows([]);
      setHouses([]);
      setStreetHouses([]);
      setStreetHouseQuery("");
    }
  };

  const lookupEnabled = countryConfig.lookup;
  const postalDigits = countryConfig.postalDigits;
  useEffect(() => {
    if (!lookupEnabled) return;
    const postal = value.postal_code.replace(/\D/g, "");
    const street = value.street.trim();
    setStreetHouses([]);
    setStreetHouseQuery("");
    if (postal.length !== postalDigits || street.length < 2) return;
    let cancelled = false;
    const timer = window.setTimeout(() => {
      void lookupLuAddress(postal, street)
        .then((result) => {
          if (cancelled) return;
          setStreetHouses(result.houses);
          setStreetHouseQuery(street);
        })
        .catch(() => {
          if (cancelled) return;
          setStreetHouses([]);
          setStreetHouseQuery("");
        });
    }, 300);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [lookupEnabled, postalDigits, value.postal_code, value.street]);

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
    setStreetRows([]);
    setHouses([]);
    setStreetHouses([]);
    setStreetHouseQuery("");
    onChange({
      ...value,
      country: next,
      postal_code: value.postal_code.replace(/\D/g, "").slice(0, nextConfig.postalDigits),
    });
  };

  const numberSource =
    streetHouseQuery.trim().toLowerCase() === value.street.trim().toLowerCase() && streetHouses.length > 0
      ? streetHouses
      : houses;
  const localityKey = value.locality.trim().toLowerCase();
  const scopedNumbers =
    localityKey && knownLocalities.has(localityKey)
      ? numberSource.filter((row) => {
          const rowLocality = (row.locality || "").trim().toLowerCase();
          return !rowLocality || rowLocality === localityKey;
        })
      : numberSource;
  const houseNumbers = houseNumberOptions(scopedNumbers, value.street);

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
              setStreetRows([]);
              setHouses([]);
              setStreetHouses([]);
              setStreetHouseQuery("");
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
          autoComplete="off"
          value={value.house_number}
          onChange={(event) => onChange({ ...valueRef.current, country, house_number: event.target.value })}
        />
        <datalist id={`${listId}-houses`}>
          {houseNumbers.map((number) => (
            <option key={number} value={number} />
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
