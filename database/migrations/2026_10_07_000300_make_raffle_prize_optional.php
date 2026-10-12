<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * A raffle is created with its name and look only; its prize and number
     * of winners are set afterwards in the Control Center.
     */
    public function up(): void
    {
        Schema::table('raffles', function (Blueprint $table) {
            $table->string('prize_name')->nullable()->change();
        });
    }

    public function down(): void
    {
        Schema::table('raffles', function (Blueprint $table) {
            $table->string('prize_name')->nullable(false)->default('')->change();
        });
    }
};
