<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * The opening countdown runs 5-4-3-2-1 instead of 3-2-1, for new raffles
     * and for the ones still on the old default.
     */
    public function up(): void
    {
        Schema::table('raffle_settings', function (Blueprint $table) {
            $table->unsignedSmallInteger('countdown_seconds')->default(5)->change();
        });

        DB::table('raffle_settings')->where('countdown_seconds', 3)->update(['countdown_seconds' => 5]);
    }

    public function down(): void
    {
        DB::table('raffle_settings')->where('countdown_seconds', 5)->update(['countdown_seconds' => 3]);

        Schema::table('raffle_settings', function (Blueprint $table) {
            $table->unsignedSmallInteger('countdown_seconds')->default(3)->change();
        });
    }
};
