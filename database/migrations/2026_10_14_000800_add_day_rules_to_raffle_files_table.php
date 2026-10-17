<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Who can win a day's draws, day by day: {"1": "everyone"} puts the
     * day's winners back in play for its later draws; a day not listed
     * draws only from the people who have not won that day yet.
     */
    public function up(): void
    {
        Schema::table('raffle_files', function (Blueprint $table) {
            $table->json('day_rules')->nullable()->after('participants_uploaded_at');
        });
    }

    public function down(): void
    {
        Schema::table('raffle_files', function (Blueprint $table) {
            $table->dropColumn('day_rules');
        });
    }
};
