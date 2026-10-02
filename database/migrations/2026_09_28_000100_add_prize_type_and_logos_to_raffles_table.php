<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * A prize is either cash (the amount is the headline) or an item such as a
     * brand new car (the item is the headline, its value optional). And a
     * raffle can carry several company logos instead of one.
     */
    public function up(): void
    {
        Schema::table('raffles', function (Blueprint $table) {
            $table->string('prize_type', 16)->default('cash')->after('prize_name');
            $table->json('logos')->nullable()->after('prize_currency');
        });

        // Carry each raffle's single logo over into the list, and treat a
        // prize with no amount as an item.
        DB::table('raffles')->orderBy('id')->each(function ($raffle) {
            DB::table('raffles')->where('id', $raffle->id)->update([
                'logos' => $raffle->logo ? json_encode([$raffle->logo]) : null,
                'prize_type' => $raffle->prize_value === null ? 'item' : 'cash',
            ]);
        });

        Schema::table('raffles', function (Blueprint $table) {
            $table->dropColumn('logo');
        });
    }

    public function down(): void
    {
        Schema::table('raffles', function (Blueprint $table) {
            $table->string('logo', 160)->nullable()->after('prize_currency');
        });

        DB::table('raffles')->orderBy('id')->each(function ($raffle) {
            $logos = json_decode($raffle->logos ?? '[]', true) ?: [];
            DB::table('raffles')->where('id', $raffle->id)->update(['logo' => $logos[0] ?? null]);
        });

        Schema::table('raffles', function (Blueprint $table) {
            $table->dropColumn(['prize_type', 'logos']);
        });
    }
};
