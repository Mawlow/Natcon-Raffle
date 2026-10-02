<?php

namespace App\Support;

/**
 * The fixed catalogue of company logos a raffle can be branded with.
 *
 * The list lives in resources/data/raffle-logos.json, which the admin screens
 * read too, so a raffle can only ever point at one of these files.
 */
class RaffleLogos
{
    /** @var array<string, array{id:string, group:string, label:string, path:string, tone:string}>|null */
    protected static ?array $catalogue = null;

    /** @return array<string, array{id:string, group:string, label:string, path:string, tone:string}> */
    public static function all(): array
    {
        if (static::$catalogue === null) {
            $entries = json_decode(file_get_contents(resource_path('data/raffle-logos.json')), true) ?? [];
            static::$catalogue = collect($entries)->keyBy('id')->all();
        }

        return static::$catalogue;
    }

    /** @return array<int, string> */
    public static function ids(): array
    {
        return array_keys(static::all());
    }

    /** @return array{id:string, group:string, label:string, path:string, tone:string}|null */
    public static function find(?string $id): ?array
    {
        return $id === null ? null : (static::all()[$id] ?? null);
    }

    /**
     * The catalogue entries for a list of ids, in the order given. Ids no
     * longer in the catalogue are skipped.
     *
     * @param  array<int, string>|null  $ids
     * @return array<int, array{id:string, group:string, label:string, path:string, tone:string}>
     */
    public static function findMany(?array $ids): array
    {
        return collect($ids ?? [])->map(fn ($id) => static::find($id))->filter()->values()->all();
    }
}
